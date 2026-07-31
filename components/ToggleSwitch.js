"use client";

export default function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label className="relative inline-block w-[36px] h-[20px] shrink-0">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer opacity-0 w-0 h-0"
      />
      <span className="absolute inset-0 rounded-full bg-gray-300 dark:bg-night-700 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 transition cursor-pointer before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:left-0.5 before:top-[3px] before:bg-white before:rounded-full before:transition peer-checked:before:translate-x-[16px] peer-disabled:opacity-60" />
    </label>
  );
}
