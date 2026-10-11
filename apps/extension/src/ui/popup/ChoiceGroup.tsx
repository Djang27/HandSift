export interface ChoiceGroupProps<T extends string> {
  legend: string;
  name: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  note?: string;
}

/** A labeled group of radio buttons. */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  note,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="choice">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          <span>{option.label}</span>
          {option.hint && <span className="choice__hint">{option.hint}</span>}
        </label>
      ))}
      {note && <p className="choice-group__note">{note}</p>}
    </fieldset>
  );
}
