import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { pinyin } from "pinyin-pro";

export type SearchableSelectOption = {
  label: string;
  value: string;
};

type SearchableSelectProps = {
  ariaLabel?: string;
  disabled?: boolean;
  emptyText?: string;
  onChange(value: string): void;
  options: SearchableSelectOption[];
  placeholder?: string;
  value: string;
};

type SearchIndex = { lower: string; full: string; initials: string };

const pinyinCache = new Map<string, SearchIndex>();

// 为选项预计算拼音匹配串：全拼（连写）与首字母串（连写），模块级缓存避免重复计算。
// 例如 "彩利服饰" -> full: "cailifushi", initials: "clfs"
function buildSearchIndex(label: string): SearchIndex {
  const cached = pinyinCache.get(label);
  if (cached) return cached;

  const lower = label.toLowerCase();
  let full = "";
  let initials = "";
  try {
    const fullParts = pinyin(label, { toneType: "none", type: "array" }) as string[];
    full = fullParts.join("").toLowerCase();
    const initialParts = pinyin(label, { pattern: "first", toneType: "none", type: "array" }) as string[];
    initials = initialParts.join("").toLowerCase();
  } catch {
    // pinyin 解析失败时退化为仅匹配原字符串
  }
  const index = { lower, full, initials };
  pinyinCache.set(label, index);
  return index;
}

function matchQuery(index: SearchIndex, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (index.lower.includes(q)) return true;
  if (/^[a-z]+$/.test(q) && (index.full.includes(q) || index.initials.includes(q))) return true;
  return false;
}

export function SearchableSelect({
  ariaLabel,
  disabled = false,
  emptyText = "无匹配项",
  onChange,
  options,
  placeholder = "请选择",
  value,
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? "";

  const visibleOptions = isOpen
    ? options.filter((option) => matchQuery(buildSearchIndex(option.label), query)).map((option) => option)
    : [];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;

    const activeOption = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  function openDropdown() {
    if (disabled) return;
    setIsOpen(true);
  }

  function commit(option?: SearchableSelectOption) {
    if (!option) return;
    onChange(option.value);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setIsOpen(true);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        openDropdown();
      } else {
        setActiveIndex((index) => Math.min(index + 1, visibleOptions.length - 1));
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(visibleOptions[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className={`animated-select searchable-select ${isOpen ? "is-open" : ""}`} ref={rootRef}>
      <div className="animated-select-trigger" onClick={openDropdown}>
        <Search className="searchable-select-icon" size={15} />
        <input
          aria-label={ariaLabel}
          className="searchable-select-input"
          disabled={disabled}
          onBlur={() => {
            if (!rootRef.current?.contains(document.activeElement)) {
              setIsOpen(false);
              setQuery("");
            }
          }}
          onChange={handleInputChange}
          onFocus={openDropdown}
          onKeyDown={handleInputKeyDown}
          placeholder={selectedLabel || placeholder}
          ref={inputRef}
          type="text"
          value={isOpen ? query : selectedLabel}
        />
        <ChevronDown
          onClick={(event) => {
            event.stopPropagation();
            if (isOpen) {
              setIsOpen(false);
              setQuery("");
            } else {
              openDropdown();
              inputRef.current?.focus();
            }
          }}
          size={17}
        />
      </div>

      {isOpen && (
        <div className="animated-select-popover">
          <div className="animated-select-list searchable-select-list" ref={listRef} role="listbox">
            {visibleOptions.length === 0 ? (
              <div className="searchable-select-empty">{emptyText}</div>
            ) : (
              visibleOptions.map((option, index) => (
                <button
                  aria-selected={option.value === value}
                  className={`animated-select-item ${option.value === value ? "is-selected" : ""} ${
                    index === activeIndex ? "is-active" : ""
                  }`}
                  data-index={index}
                  key={`${option.value}-${index}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
