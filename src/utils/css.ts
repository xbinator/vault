import { isNumber, isUndefined } from 'lodash-es';

export function addCssUnit<T extends string | number | undefined>(value: T) {
  if (isUndefined(value)) return value;

  const validate = (v: string) => /^(((-?[0-9.]+)(pt|pc|px|rem|em|%|vh|vw|rpx))|(auto))$/i.test(v);

  const convert = (v: number) => (v ? `${v}px` : `${v}`);

  const result = (v: string | number) => {
    if (validate(String(v))) return `${v}`;

    const m = parseFloat(`${v}`);

    return m === 1 ? '1px' : convert(m);
  };

  if (isNumber(value)) return result(value);

  if (validate(value)) {
    if (/vw$/.test(value)) return `${parseInt(value, 10) * 0.01 * 375}px`;

    if (/vh$/.test(value)) return `${parseInt(value, 10) * 0.01 * 667}px`;

    return `${value}`;
  }

  return value?.replace(/-?[0-9.]+[a-z%]*/gi, (v) => result(v));
}
