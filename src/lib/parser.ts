import { ReportSchema } from "@/src/constants/schemas";
import { 
  CURRENCY_MAP, 
  COUNTRY_MAP, 
  MTI_MAP, 
  FUNCTION_CODE_MAP, 
  IRD_MAP,
  mapValue 
} from "@/src/constants/mappers";

export interface ParsedRecord {
  [key: string]: string | number;
}

export function parseTN070File(content: string, schema: ReportSchema): ParsedRecord[] {
  const isMastercard = schema.id.startsWith('IP');
  const totalRecordLength = schema.fields.reduce((sum, field) => sum + field.length, 0);
  
  let lines: string[] = [];
  
  if (isMastercard) {
    // Mastercard TN070 reports often have headers/trailers with the report ID.
    // We find the section for this specific report.
    const reportStartIdx = content.indexOf(schema.id);
    if (reportStartIdx === -1) return [];

    // Find the end of this report section (next report or end of file)
    let endIdx = content.indexOf('IP', reportStartIdx + schema.id.length);
    if (endIdx === -1) endIdx = content.length;
    
    const reportSection = content.substring(reportStartIdx, endIdx);
    const rawLines = reportSection.split(/\r?\n/);
    
    lines = rawLines.filter(line => {
      const trimmed = line.trim();
      if (trimmed.length < totalRecordLength * 0.8) return false; // Too short to be data
      
      // Filter out header/trailer lines
      if (trimmed.includes(schema.id)) return false;
      if (trimmed.includes('RUN DATE')) return false;
      if (trimmed.includes('PAGE ')) return false;
      if (trimmed.includes('REPORT ')) return false;
      if (trimmed.includes('-------')) return false;
      
      return true;
    });
  } else {
    // Visa logic (Incoming Clearing File)
    if (content.includes('\n')) {
      lines = content.split(/\r?\n/).filter(line => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return false;
        // Filter by record type if specified in schema (usually first 2 chars for Visa)
        if (schema.recordTypeCode && !trimmed.startsWith(schema.recordTypeCode)) {
          return false;
        }
        // Filter by TCR code if specified (4th character, index 3)
        if (schema.tcrCode && trimmed.length >= 4 && trimmed[3] !== schema.tcrCode) {
          return false;
        }
        // Filter by TCR sub-code if specified (e.g., DE 1 for TC33.A, index 4-5)
        if (schema.tcrSubCode && trimmed.length >= 6 && trimmed.substring(4, 6) !== schema.tcrSubCode) {
          return false;
        }
        return true;
      });
    } else {
      // If no newlines, assume fixed-width records concatenated
      for (let i = 0; i < content.length; i += totalRecordLength) {
        const record = content.substring(i, i + totalRecordLength);
        if (record.length === totalRecordLength) {
          // Filter by record type if specified in schema
          if (schema.recordTypeCode && !record.startsWith(schema.recordTypeCode)) {
            continue;
          }
          // Filter by TCR sub-code if specified
          if (schema.tcrSubCode && record.length >= 6 && record.substring(4, 6) !== schema.tcrSubCode) {
            continue;
          }
          lines.push(record);
        }
      }
    }
  }

  return lines.map(line => {
    const record: ParsedRecord = {};
    let offset = 0;

    schema.fields.forEach(field => {
      const rawValue = line.substring(offset, offset + field.length).trim();
      
      if (field.type === 'Numeric') {
        const num = parseFloat(rawValue);
        record[field.name] = isNaN(num) ? rawValue : num;
      } else {
        record[field.name] = rawValue;
      }

      // Add human-readable labels for specific fields
      const fieldNameLower = field.name.toLowerCase();
      if (fieldNameLower.includes('currency') && fieldNameLower.includes('code')) {
        record[`${field.name} (Label)`] = mapValue(record[field.name], CURRENCY_MAP);
      } else if (fieldNameLower.includes('country') && fieldNameLower.includes('code')) {
        record[`${field.name} (Label)`] = mapValue(record[field.name], COUNTRY_MAP);
      } else if (fieldNameLower === 'mti' || fieldNameLower === 'mti code') {
        record['MTI (Label)'] = mapValue(record[field.name], MTI_MAP);
      } else if (fieldNameLower === 'function code' || fieldNameLower === 'func-cd' || fieldNameLower === 'trans. func.') {
        record['Function (Label)'] = mapValue(record[field.name], FUNCTION_CODE_MAP);
      } else if (fieldNameLower === 'ird' || fieldNameLower.includes('rate designator')) {
        record['IRD (Label)'] = mapValue(record[field.name], IRD_MAP);
      }
      
      offset += field.length;
    });

    return record;
  });
}

export function getTopValues(records: ParsedRecord[], fieldName: string, limit: number = 50): string[] {
  const values = records.map(r => String(r[fieldName]));
  const uniqueValues = Array.from(new Set(values));
  return uniqueValues.slice(0, limit);
}
