import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../components/ui/Modal';

describe('Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<Modal isOpen={false} onClose={vi.fn()} title="Test">Content</Modal>);
    expect(container.innerHTML).toBe('');
  });

  it('renders content when open', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="Test Title">Modal Body</Modal>);
    expect(screen.getByText('Modal Body')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal isOpen={true} onClose={onClose} title="Test">Body</Modal>);
    const backdrop = container.querySelector('[data-testid="modal-backdrop"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on content click', () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test">Body</Modal>);
    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test">Body</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has accessible dialog role and aria label', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="Accessible Title">Body</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
