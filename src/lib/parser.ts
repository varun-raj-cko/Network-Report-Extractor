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

export function parseTN070File(content: string, schema: ReportSchema, preSplitLines?: string[]): ParsedRecord[] {
  const isMastercard = schema.id.startsWith('IP');
  const totalRecordLength = schema.fields.reduce((sum, field) => sum + field.length, 0);
  
  if (totalRecordLength <= 0) return [];
  
  let lines: string[] = [];
  
  if (isMastercard) {
    if (preSplitLines) {
      // If we have pre-split lines, we need to find the section. 
      // This is trickier with pre-split, so we'll fallback to content for Mastercard if needed.
      // But usually Mastercard reports are not 100MB+ in this specific tool's usage compared to Visa clearing files.
    }
    
    const reportStartIdx = content.indexOf(schema.id);
    if (reportStartIdx === -1) return [];

    let endIdx = content.indexOf('IP', reportStartIdx + schema.id.length);
    if (endIdx === -1) endIdx = content.length;
    
    const reportSection = content.substring(reportStartIdx, endIdx);
    const rawLines = reportSection.split(/\r?\n/);
    
    lines = rawLines.filter(line => {
      const trimmed = line.trim();
      if (trimmed.length < totalRecordLength * 0.5) return false;
      if (trimmed.includes(schema.id)) return false;
      if (trimmed.includes('RUN DATE')) return false;
      if (trimmed.includes('PAGE ')) return false;
      if (trimmed.includes('REPORT ')) return false;
      if (trimmed.includes('-------')) return false;
      return true;
    });
  } else {
    // Visa logic
    if (preSplitLines) {
      lines = preSplitLines.filter(line => {
        if (line.length < 2) return false;
        if (schema.recordTypeCode && !line.startsWith(schema.recordTypeCode)) return false;
        if (schema.tcrCode && line.length >= 4 && line[3] !== schema.tcrCode) return false;
        if (schema.tcrSubCode && line.length >= 6 && line.substring(4, 6) !== schema.tcrSubCode) return false;
        return true;
      });
    } else if (content.includes('\n')) {
      lines = content.split(/\r?\n/).filter(line => {
        if (line.length < 2) return false;
        if (schema.recordTypeCode && !line.startsWith(schema.recordTypeCode)) return false;
        if (schema.tcrCode && line.length >= 4 && line[3] !== schema.tcrCode) return false;
        if (schema.tcrSubCode && line.length >= 6 && line.substring(4, 6) !== schema.tcrSubCode) return false;
        return true;
      });
    } else {
      for (let i = 0; i < content.length; i += totalRecordLength) {
        const record = content.substring(i, i + totalRecordLength);
        if (record.length === totalRecordLength) {
          if (schema.recordTypeCode && !record.startsWith(schema.recordTypeCode)) continue;
          if (schema.tcrCode && record.length >= 4 && record[3] !== schema.tcrCode) continue;
          if (schema.tcrSubCode && record.length >= 6 && record.substring(4, 6) !== schema.tcrSubCode) continue;
          lines.push(record);
        }
      }
    }
  }

  // Optimized mapping
  const parsedRecords: ParsedRecord[] = [];
  const fields = schema.fields;
  const fieldsLen = fields.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const record: ParsedRecord = {};
    let offset = 0;

    for (let j = 0; j < fieldsLen; j++) {
      const field = fields[j];
      const flen = field.length;
      const rawValue = line.substring(offset, offset + flen).trim();
      
      if (field.type === 'Numeric') {
        const num = parseFloat(rawValue);
        record[field.name] = isNaN(num) ? rawValue : num;
      } else {
        record[field.name] = rawValue;
      }

      const fieldNameLower = field.name.toLowerCase();
      // Only do mapping for common fields to save time if needed, 
      // but let's keep it for now and see if the split/filter was the issue
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
      
      offset += flen;
    }
    parsedRecords.push(record);
  }

  return parsedRecords;
}

/**
 * Lightweight discovery function that doesn't do full parsing
 */
export function countMatchingRecords(content: string, schema: ReportSchema, lines?: string[]): number {
  const isMastercard = schema.id.startsWith('IP');
  
  if (isMastercard) {
    if (!content.includes(schema.id)) return 0;
    
    // For Mastercard, we find the report section and count lines that look like data
    const reportStartIdx = content.indexOf(schema.id);
    let endIdx = content.indexOf('IP', reportStartIdx + schema.id.length);
    if (endIdx === -1) endIdx = content.length;
    
    const reportSection = content.substring(reportStartIdx, endIdx);
    const rawLines = reportSection.split(/\r?\n/);
    
    const totalRecordLength = schema.fields.reduce((sum, field) => sum + field.length, 0);

    return rawLines.filter(line => {
      const trimmed = line.trim();
      // Heuristic: line must be at least 50% of the expected record length
      // and not match common header/footer patterns
      if (trimmed.length < totalRecordLength * 0.5) return false;
      if (trimmed.includes(schema.id)) return false;
      if (trimmed.includes('RUN DATE')) return false;
      if (trimmed.includes('PAGE ')) return false;
      if (trimmed.includes('REPORT ')) return false;
      if (trimmed.includes('-------')) return false;
      return true;
    }).length;
  }

  // Visa logic - efficient counting
  let count = 0;
  if (lines) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 2) continue;
      if (schema.recordTypeCode && !line.startsWith(schema.recordTypeCode)) continue;
      if (schema.tcrCode && (line.length < 4 || line[3] !== schema.tcrCode)) continue;
      if (schema.tcrSubCode && (line.length < 6 || line.substring(4, 6) !== schema.tcrSubCode)) continue;
      count++;
    }
  } else if (content.includes('\n')) {
    const splitLines = content.split(/\r?\n/);
    for (let i = 0; i < splitLines.length; i++) {
      const line = splitLines[i];
      if (line.length < 2) continue;
      if (schema.recordTypeCode && !line.startsWith(schema.recordTypeCode)) continue;
      if (schema.tcrCode && (line.length < 4 || line[3] !== schema.tcrCode)) continue;
      if (schema.tcrSubCode && (line.length < 6 || line.substring(4, 6) !== schema.tcrSubCode)) continue;
      count++;
    }
  } else {
    const totalRecordLength = schema.fields.reduce((sum, field) => sum + field.length, 0);
    if (totalRecordLength <= 0) return 0;
    for (let i = 0; i < content.length; i += totalRecordLength) {
      if (schema.recordTypeCode && !content.startsWith(schema.recordTypeCode, i)) continue;
      if (schema.tcrCode && (i + 3 >= content.length || content[i + 3] !== schema.tcrCode)) continue;
      if (schema.tcrSubCode && (i + 5 >= content.length || content.substring(i + 4, i + 6) !== schema.tcrSubCode)) continue;
      count++;
    }
  }
  return count;
}

export function getTopValues(records: ParsedRecord[], fieldName: string, limit: number = 50): string[] {
  const values = records.map(r => String(r[fieldName]));
  const uniqueValues = Array.from(new Set(values));
  return uniqueValues.slice(0, limit);
}
