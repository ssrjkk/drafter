/**
 * Task type definitions and categories
 * @module tasks
 * @author ssrjkk
 */

export const TASK_CATEGORIES = ['all', 'generate', 'analyze', 'review', 'setup'] as const;
export type TaskCategory = typeof TASK_CATEGORIES[number];

export const TASK_TYPES = [
  { id: "test_plan", icon: "📋", label: "Test Plan", color: "#14b8a6", category: "generate" },
  { id: "test_cases", icon: "✅", label: "Test Cases", color: "#22c55e", category: "generate" },
  { id: "automation_code", icon: "⚡", label: "Automation", color: "#f59e0b", category: "generate" },
  { id: "api_tests", icon: "🔗", label: "API Tests", color: "#06b6d4", category: "generate" },
  { id: "load_test", icon: "📊", label: "Load Test", color: "#0f766e", category: "generate" },
  { id: "mobile_tests", icon: "📱", label: "Mobile", color: "#10b981", category: "generate" },
  { id: "ai_model_tests", icon: "🤖", label: "AI Tests", color: "#64748b", category: "generate" },
  { id: "requirements", icon: "📝", label: "Requirements", color: "#0d9488", category: "analyze" },
  { id: "observability", icon: "📈", label: "Observability", color: "#0ea5e9", category: "analyze" },
  { id: "quality_metrics", icon: "🎯", label: "Metrics", color: "#f43f5e", category: "analyze" },
  { id: "bug_report", icon: "🐛", label: "Bug Report", color: "#ef4444", category: "review" },
  { id: "code_review", icon: "🔍", label: "Code Review", color: "#8b5cf6", category: "review" },
  { id: "screenshot_analysis", icon: "🖼️", label: "Screenshot", color: "#0d9488", category: "review" },
  { id: "security_check", icon: "🔒", label: "Security", color: "#14b8a6", category: "setup" },
  { id: "ci_pipeline", icon: "🚀", label: "CI/CD", color: "#f97316", category: "setup" },
  { id: "checklist", icon: "☑️", label: "Checklist", color: "#84cc16", category: "setup" },
  { id: "contract_tests", icon: "📜", label: "Contracts", color: "#d946ef", category: "setup" },
] as const;

export type TaskType = typeof TASK_TYPES[number];
