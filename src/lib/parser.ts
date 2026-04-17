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
      if (trimmed.includes('RUN DATE') || trimmed.includes('PAGE ') || trimmed.includes('REPORT ') || trimmed.includes('-------')) return false;
      return true;
    });
  } else {
    // Optimized Visa logic
    if (preSplitLines) {
      lines = preSplitLines.filter(line => {
        if (line.length < 4) return false;
        if (schema.recordTypeCode && line[0] !== schema.recordTypeCode[0]) return false; // Quick check
        if (schema.recordTypeCode && !line.startsWith(schema.recordTypeCode)) return false;
        if (schema.tcrCode && line[3] !== schema.tcrCode) return false;
        if (schema.tcrSubCode && line.substring(4, 6) !== schema.tcrSubCode) return false;
        return true;
      });
    } else {
      // Direct scan on content to avoid split() overhead for large files
      const hasNewlines = content.includes('\n');
      if (hasNewlines) {
        const splitLines = content.split(/\r?\n/);
        for (let i = 0; i < splitLines.length; i++) {
          const line = splitLines[i];
          if (line.length < 4) continue;
          if (schema.recordTypeCode && !line.startsWith(schema.recordTypeCode)) continue;
          if (schema.tcrCode && line[3] !== schema.tcrCode) continue;
          if (schema.tcrSubCode && line.substring(4, 6) !== schema.tcrSubCode) continue;
          lines.push(line);
        }
      } else {
        // Fixed length 168
        for (let i = 0; i < content.length; i += 168) {
          const record = content.substring(i, i + 168);
          if (record.length === 168) {
            if (schema.recordTypeCode && !record.startsWith(schema.recordTypeCode)) continue;
            if (schema.tcrCode && record[3] !== schema.tcrCode) continue;
            if (schema.tcrSubCode && record.substring(4, 6) !== schema.tcrSubCode) continue;
            lines.push(record);
          }
        }
      }
    }
  }

  // Optimized mapping pass
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
      
      record[field.name] = field.type === 'Numeric' ? (parseInt(rawValue, 10) || rawValue) : rawValue;

      const fn = field.name.toLowerCase();
      if (fn.includes('currency') && fn.includes('code')) {
        record[`${field.name} (Label)`] = mapValue(record[field.name], CURRENCY_MAP);
      } else if (fn.includes('country') && fn.includes('code')) {
        record[`${field.name} (Label)`] = mapValue(record[field.name], COUNTRY_MAP);
      } else if (fn === 'mti' || fn === 'mti code') {
        record['MTI (Label)'] = mapValue(record[field.name], MTI_MAP);
      } else if (fn === 'function code' || fn === 'func-cd' || fn === 'trans. func.') {
        record['Function (Label)'] = mapValue(record[field.name], FUNCTION_CODE_MAP);
      } else if (fn === 'ird' || fn.includes('rate designator')) {
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
