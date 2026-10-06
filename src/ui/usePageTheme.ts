import { useEffect, useState } from 'react';
import { loadSettings, onSettingsChanged } from '@/settings/storage';
import type { Settings } from '@/settings/schema';

function resolve(appearance: Settings['appearance']): 'light' | 'dark' {
  if (appearance !== 'host') return appearance;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Theme for extension pages (options, popup): the Appearance setting, else the OS preference. */
export function usePageTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => resolve('host'));
  useEffect(() => {
    void loadSettings().then((s) => setTheme(resolve(s.appearance)));
    return onSettingsChanged((s) => setTheme(resolve(s.appearance)));
  }, []);
  useEffect(() => {
    document.body.style.background = theme === 'dark' ? '#1f1e1c' : '#ffffff';
  }, [theme]);
  return theme;
}
