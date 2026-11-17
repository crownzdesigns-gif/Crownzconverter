export type Theme = "dark" | "light";

const KEY = "crownz-theme";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}
