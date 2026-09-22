import { describe, it, expect } from 'vitest';
import { exportUtils, type MarkdownOptions, type JsonExportOptions, type CsvRow } from '../lib/export';

describe('exportUtils', () => {
  const baseOptions = {
    output: 'Test output content',
    context: 'Test context',
    taskType: 'test-generation',
    projectName: 'My Project',
    timestamp: new Date('2025-01-15T10:30:00Z'),
  };

  describe('toMarkdown()', () => {
    it('produces a Blob with markdown content', async () => {
      const blob = await exportUtils.toMarkdown(baseOptions);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toContain('text/markdown');
    });

    it('includes header and output', async () => {
      const blob = await exportUtils.toMarkdown(baseOptions);
      const text = await blob.text();
      expect(text).toContain('Drafter');
      expect(text).toContain('Test output content');
    });

    it('includes project name when provided', async () => {
      const blob = await exportUtils.toMarkdown(baseOptions);
      const text = await blob.text();
      expect(text).toContain('My Project');
    });

    it('includes context when provided', async () => {
      const blob = await exportUtils.toMarkdown(baseOptions);
      const text = await blob.text();
      expect(text).toContain('Test context');
    });

    it('skips meta when includeMeta=false', async () => {
      const opts: MarkdownOptions = { ...baseOptions, includeMeta: false };
      const blob = await exportUtils.toMarkdown(opts);
      const text = await blob.text();
      expect(text).not.toContain('# Drafter');
      expect(text).toContain('Test output content');
    });

    it('skips timestamp when includeTimestamp=false', async () => {
      const opts: MarkdownOptions = { ...baseOptions, includeTimestamp: false };
      const blob = await exportUtils.toMarkdown(opts);
      const text = await blob.text();
      expect(text).not.toContain('Date:');
    });

    it('sanitizes HTML in context and project name', async () => {
      const opts: MarkdownOptions = {
        ...baseOptions,
        projectName: '<script>alert("xss")</script>',
        context: '<img onerror=alert(1)>',
      };
      const blob = await exportUtils.toMarkdown(opts);
      const text = await blob.text();
      expect(text).not.toContain('<script>');
      expect(text).not.toContain('<img');
    });
  });

  describe('toJson()', () => {
    it('produces valid JSON blob', async () => {
      const blob = await exportUtils.toJson(baseOptions);
      expect(blob.type).toContain('application/json');
      const text = await blob.text();
      const parsed = JSON.parse(text);
      expect(parsed.output).toBe('Test output content');
      expect(parsed.project).toBe('My Project');
    });

    it('includes version when includeVersion=true', async () => {
      const opts: JsonExportOptions = { ...baseOptions, includeVersion: true };
      const blob = await exportUtils.toJson(opts);
      const text = await blob.text();
      const parsed = JSON.parse(text);
      expect(parsed.version).toBe('1.0');
    });

    it('excludes version when includeVersion=false', async () => {
      const blob = await exportUtils.toJson(baseOptions);
      const text = await blob.text();
      const parsed = JSON.parse(text);
      expect(parsed.version).toBeUndefined();
    });

    it('includes ISO timestamp', async () => {
      const blob = await exportUtils.toJson(baseOptions);
      const text = await blob.text();
      const parsed = JSON.parse(text);
      expect(parsed.timestamp).toBe('2025-01-15T10:30:00.000Z');
    });
  });

  describe('toCsv()', () => {
    it('produces CSV blob', async () => {
      const rows: CsvRow[] = [
        { name: 'Alice', score: 100 },
        { name: 'Bob', score: 200 },
      ];
      const blob = await exportUtils.toCsv(rows);
      expect(blob.type).toContain('text/csv');
      const text = await blob.text();
      expect(text).toContain('name,score');
      expect(text).toContain('Alice,100');
      expect(text).toContain('Bob,200');
    });

    it('uses custom headers when provided', async () => {
      const rows: CsvRow[] = [{ a: 1, b: 2, c: 3 }];
      const blob = await exportUtils.toCsv(rows, ['a', 'c']);
      const text = await blob.text();
      expect(text).toContain('a,c');
      expect(text).not.toContain('b');
    });

    it('handles values with commas by quoting', async () => {
      const rows: CsvRow[] = [{ text: 'hello, world' }];
      const blob = await exportUtils.toCsv(rows);
      const text = await blob.text();
      expect(text).toContain('"hello, world"');
    });

    it('handles values with quotes by doubling', async () => {
      const rows: CsvRow[] = [{ text: 'say "hi"' }];
      const blob = await exportUtils.toCsv(rows);
      const text = await blob.text();
      expect(text).toContain('"say ""hi"""');
    });

    it('handles empty values', async () => {
      const rows: CsvRow[] = [{ a: 1, b: undefined }];
      const blob = await exportUtils.toCsv(rows);
      const text = await blob.text();
      const lines = text.split('\n');
      expect(lines[1]).toContain('1,');
    });

    it('prefixes formula-injection characters with tab', async () => {
      const rows: CsvRow[] = [{ val: '=SUM(A1)' }];
      const blob = await exportUtils.toCsv(rows);
      const text = await blob.text();
      expect(text).toContain('\t=SUM(A1)');
    });
  });

  describe('toText()', () => {
    it('produces plain text blob', async () => {
      const blob = await exportUtils.toText(baseOptions);
      expect(blob.type).toContain('text/plain');
      const text = await blob.text();
      expect(text).toContain('DRAFTER REPORT');
      expect(text).toContain('Test output content');
    });

    it('includes project name when provided', async () => {
      const blob = await exportUtils.toText(baseOptions);
      const text = await blob.text();
      expect(text).toContain('My Project');
    });

    it('includes context when provided', async () => {
      const blob = await exportUtils.toText(baseOptions);
      const text = await blob.text();
      expect(text).toContain('Test context');
    });

    it('omits project when not provided', async () => {
      const opts = { output: 'test' };
      const blob = await exportUtils.toText(opts);
      const text = await blob.text();
      expect(text).not.toContain('Project:');
    });
  });

  describe('generateFilename()', () => {
    it('generates filename with date', () => {
      const name = exportUtils.generateFilename('md');
      expect(name).toMatch(/^drafter-report-\d{4}-\d{2}-\d{2}\.md$/);
    });

    it('includes task type in prefix when provided', () => {
      const name = exportUtils.generateFilename('json', 'test-gen');
      expect(name).toMatch(/^test-gen-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('sanitizes special chars in taskType', () => {
      const name = exportUtils.generateFilename('txt', 'my task/v2!');
      expect(name).toMatch(/^my-task-v2--\d{4}-\d{2}-\d{2}\.txt$/);
    });
  });

  describe('toPdf()', () => {
    it('produces PDF blob', async () => {
      const blob = await exportUtils.toPdf(baseOptions);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toContain('application/pdf');
    });
  });
});
