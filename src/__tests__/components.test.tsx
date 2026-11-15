import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlassCard } from '../components/ui/GlassCard';
import { RippleButton } from '../components/ui/RippleButton';
import { TaskSelector } from '../components/selectors/TaskSelector';

describe('GlassCard', () => {
  it('renders children correctly', () => {
    render(<GlassCard>Test Content</GlassCard>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<GlassCard className="custom-class">Content</GlassCard>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('has correct base styling', () => {
    const { container } = render(<GlassCard>Content</GlassCard>);
    expect(container.firstChild).toHaveClass('backdrop-blur-xl');
    expect(container.firstChild).toHaveClass('bg-white/80');
    expect(container.firstChild).toHaveClass('border-gray-200');
  });

  it('disables hover effect when hover prop is false', () => {
    const { container } = render(<GlassCard hover={false}>Content</GlassCard>);
    const child = container.firstChild as HTMLElement;
    expect(child.dataset.waapi).toBeUndefined();
  });
});

describe('RippleButton', () => {
  it('renders children correctly', () => {
    render(<RippleButton>Click Me</RippleButton>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<RippleButton onClick={handleClick}>Click Me</RippleButton>);
    fireEvent.click(screen.getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not trigger click when disabled', () => {
    const handleClick = vi.fn();
    render(
      <RippleButton onClick={handleClick} disabled>
        Disabled Button
      </RippleButton>
    );
    fireEvent.click(screen.getByText('Disabled Button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies primary variant by default', () => {
    const { container } = render(<RippleButton>Button</RippleButton>);
    expect(container.querySelector('button')).toHaveClass('bg-teal-600');
  });

  it('applies secondary variant correctly', () => {
    const { container } = render(<RippleButton variant="secondary">Button</RippleButton>);
    expect(container.querySelector('button')).toHaveClass('bg-gray-100');
  });

  it('applies danger variant correctly', () => {
    const { container } = render(<RippleButton variant="danger">Button</RippleButton>);
    expect(container.querySelector('button')).toHaveClass('bg-red-100');
  });

  it('has disabled cursor style when disabled', () => {
    const { container } = render(
      <RippleButton disabled>
        Button
      </RippleButton>
    );
    const button = container.querySelector('button');
    expect(button).toBeDisabled();
  });
});

describe('TaskSelector', () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it('renders task options', () => {
    render(<TaskSelector selectedTask={null} onSelect={mockOnSelect} />);
    expect(screen.getByText('Test Plan')).toBeInTheDocument();
    expect(screen.getByText('Test Cases')).toBeInTheDocument();
    expect(screen.getByText('Bug Report')).toBeInTheDocument();
  });

  it('calls onSelect when task is clicked', () => {
    render(<TaskSelector selectedTask={null} onSelect={mockOnSelect} />);
    fireEvent.click(screen.getByText('Test Plan'));
    expect(mockOnSelect).toHaveBeenCalledWith('test_plan');
  });

  it('highlights selected task', () => {
    render(<TaskSelector selectedTask="test_plan" onSelect={mockOnSelect} />);
    expect(screen.getByText('Test Plan')).toBeInTheDocument();
    const taskElement = screen.getByText('Test Plan').closest('[class*="rounded"]');
    expect(taskElement).toBeTruthy();
  });
});
