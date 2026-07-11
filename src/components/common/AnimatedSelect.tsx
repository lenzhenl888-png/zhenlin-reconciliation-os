import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type AnimatedSelectOption = {
  label: string;
  value: string;
};

type AnimatedSelectProps = {
  ariaLabel?: string;
  disabled?: boolean;
  onChange(value: string): void;
  options: AnimatedSelectOption[];
  value: string;
};

export function AnimatedSelect({ ariaLabel, disabled = false, onChange, options, value }: AnimatedSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(0);
  const selectedLabel = useMemo(() => options.find((option) => option.value === value)?.label ?? "", [options, value]);

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;

    const activeOption = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: "nearest" });
    updateGradients(listRef.current);
  }, [activeIndex, isOpen]);

  function commit(index: number) {
    const option = options[index];
    if (!option) return;

    onChange(option.value);
    setIsOpen(false);
  }

  function updateGradients(element: HTMLDivElement) {
    const { clientHeight, scrollHeight, scrollTop } = element;
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setTopGradientOpacity(Math.min(scrollTop / 42, 1));
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 42, 1));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        commit(activeIndex);
      } else {
        setIsOpen(true);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className={`animated-select ${isOpen ? "is-open" : ""}`} ref={rootRef}>
      <button
        aria-controls={isOpen ? id : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="animated-select-trigger"
        disabled={disabled || options.length === 0}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={17} />
      </button>

      {isOpen && (
        <div className="animated-select-popover">
          <div
            className="animated-select-list"
            id={id}
            onScroll={(event) => updateGradients(event.currentTarget)}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
          >
            {options.map((option, index) => (
              <button
                aria-selected={option.value === value}
                className={`animated-select-item ${option.value === value ? "is-selected" : ""} ${
                  index === activeIndex ? "is-active" : ""
                }`}
                data-index={index}
                key={`${option.value}-${index}`}
                onClick={() => commit(index)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <div className="animated-select-gradient top-gradient" style={{ opacity: topGradientOpacity }} />
          <div className="animated-select-gradient bottom-gradient" style={{ opacity: bottomGradientOpacity }} />
        </div>
      )}
    </div>
  );
}
