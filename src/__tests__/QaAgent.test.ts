import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { QaAgent } from '../data/agent/QaAgent';
import type { CodebaseProvider } from '../data/codebase/CodebaseProvider';
import type { UnifiedAiService } from '../data/api/UnifiedAiService';

type MockedCodebase = {
  [K in keyof CodebaseProvider]: CodebaseProvider[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : CodebaseProvider[K];
};

type MockedAiService = {
  [K in keyof UnifiedAiService]: UnifiedAiService[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : UnifiedAiService[K];
};

const mockCodebase: MockedCodebase = {
  name: 'test-project',
  isReady: true,
  listTree: vi.fn().mockResolvedValue([
    { path: 'src', name: 'src', type: 'directory' as const },
    { path: 'src/utils.ts', name: 'utils.ts', type: 'file' as const, size: 100 },
  ]),
  readFile: vi.fn().mockResolvedValue('export const sum = (a: number, b: number) => a + b;'),
  searchCode: vi.fn().mockResolvedValue([
    { path: 'src/utils.ts', line: 1, content: 'export const sum' },
  ]),
  getStructureSummary: vi.fn().mockResolvedValue('test-project/\n  src/\n    utils.ts'),
};

const mockAiService: MockedAiService = {
  executeWithRetry: vi.fn(),
  execute: vi.fn(),
  abort: vi.fn(),
  setApiKey: vi.fn(),
  setModel: vi.fn(),
  setProvider: vi.fn(),
  getProvider: vi.fn().mockReturnValue('claude'),
  supportsVision: vi.fn().mockReturnValue(false),
};

describe('QaAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a tool call and returns final answer', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );

    mockAiService.executeWithRetry
      .mockResolvedValueOnce({
        success: true,
        output: 'Let me read that file.\n```tool\n{"name": "read_file", "input": {"path": "src/utils.ts"}}\n```',
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'The function sum takes two numbers and returns their sum.',
      });

    const onStep = vi.fn();
    const result = await agent.run('What does sum do?', { onStep });

    expect(mockCodebase.readFile).toHaveBeenCalledWith('src/utils.ts');
    expect(mockAiService.executeWithRetry).toHaveBeenCalledTimes(2);
    expect(result.output).toBe('The function sum takes two numbers and returns their sum.');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.iterations).toBe(2);
  });

  it('returns text response when no tool is needed', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );

    mockAiService.executeWithRetry.mockResolvedValueOnce({
      success: true,
      output: 'This is a direct answer without tool use.',
    });

    const result = await agent.run('Simple question');

    expect(mockAiService.executeWithRetry).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('This is a direct answer without tool use.');
    expect(result.iterations).toBe(1);
  });

  it('returns gracefully on max iterations exceeded', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );

    mockAiService.executeWithRetry.mockResolvedValue({
      success: true,
      output: 'I need more info.\n```tool\n{"name": "read_file", "input": {"path": "x.ts"}}\n```',
    });

    const result = await agent.run('loop test', { maxIterations: 3 });

    expect(result.iterations).toBe(3);
    // The raw ```tool {...}``` block must never be handed back as the QA
    // deliverable — it used to be saved to `tasks.output` and exported.
    expect(result.output).not.toContain('```tool');
    expect(result.output).not.toContain('"name": "read_file"');
    expect(result.output).toContain('without producing an answer');
    expect(mockAiService.executeWithRetry).toHaveBeenCalledTimes(3);
  });

  it('returns the last prose answer when the step limit is hit', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );

    mockAiService.executeWithRetry
      .mockResolvedValueOnce({ success: true, output: 'Initial analysis of the module.' })
      .mockResolvedValue({ success: true, output: '```tool\n{"name": "read_file", "input": {"path": "x.ts"}}\n```' });

    const result = await agent.run('mixed loop test', { maxIterations: 2 });

    expect(result.output).toContain('Initial analysis of the module.');
    expect(result.output).not.toContain('```tool');
  });

  it('handles tool execution errors gracefully', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );
    mockCodebase.readFile.mockRejectedValueOnce(new Error('File not found'));

    mockAiService.executeWithRetry
      .mockResolvedValueOnce({
        success: true,
        output: '```tool\n{"name": "read_file", "input": {"path": "missing.ts"}}\n```',
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'The file was not found. Let me provide a general answer.',
      });

    const result = await agent.run('Read missing file');

    expect(result.output).toBe('The file was not found. Let me provide a general answer.');
  });

  it('handles API failures', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );

    mockAiService.executeWithRetry.mockResolvedValueOnce({
      success: false,
      error: 'Rate limit exceeded',
    });

    const result = await agent.run('API failure test');

    expect(result.output).toBe('Agent completed without generating output.');
  });

  it('abort stops execution', async () => {
    const agent = new QaAgent(mockCodebase , mockAiService );

    mockAiService.executeWithRetry.mockImplementation(() => {
      agent.abort();
      return Promise.resolve({ success: true, output: 'response' });
    });

    const result = await agent.run('abort test');
    expect(result.iterations).toBeLessThanOrEqual(1);
  });
});
