import * as i18n from '@solid-primitives/i18n';
import { createSignal, createResource } from 'solid-js';
import { dict as enDict } from './en';
import { dict as zhDict } from './zh';

/** 支持的语言 */
export type Locale = 'en' | 'zh';

/** 原始字典类型 */
export type RawDictionary = typeof enDict;

/** 展平后的字典类型 */
export type Dictionary = i18n.Flatten<RawDictionary>;

const dictionaries: Record<Locale, RawDictionary> = {
  en: enDict,
  zh: zhDict,
};

function fetchDictionary(locale: Locale): Dictionary {
  return i18n.flatten(dictionaries[locale]);
}

/** 从 localStorage 恢复语言偏好，默认中文 */
const savedLocale = localStorage.getItem('tank_locale') as Locale | null;
const initialLocale: Locale = savedLocale === 'en' ? 'en' : 'zh';

/** 当前语言 Signal */
export const [locale, setLocale] = createSignal<Locale>(initialLocale);

/** 翻译字典 Resource（随 locale 变化自动重新加载） */
export const [dict] = createResource(locale, fetchDictionary);

/** 翻译函数 t，支持模板插值 {{key}} */
export const t = i18n.translator(dict, i18n.resolveTemplate);

/** 切换语言并持\u4e45\u5316到 localStorage */
export const changeLocale = (l: Locale) => {
  setLocale(l);
  localStorage.setItem('tank_locale', l);
};
