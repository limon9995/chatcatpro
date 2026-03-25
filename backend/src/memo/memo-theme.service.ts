import { Injectable } from '@nestjs/common';
import { MemoTheme } from './memo.types';

@Injectable()
export class MemoThemeService {
  getTheme(theme: MemoTheme = 'classic', primaryColor?: string) {
    const customPrimary = this.isHexColor(primaryColor)
      ? primaryColor
      : undefined;

    if (theme === 'fashion') {
      return {
        primary: customPrimary || '#c026d3',
        secondary: '#fdf4ff',
        text: '#3b0764',
        border: '#f5d0fe',
        accent: '#db2777',
      };
    }

    if (theme === 'luxury') {
      return {
        primary: customPrimary || '#111827',
        secondary: '#fff7ed',
        text: '#1f2937',
        border: '#d4af37',
        accent: '#b45309',
      };
    }

    return {
      primary: customPrimary || '#1f2937',
      secondary: '#f9fafb',
      text: '#111827',
      border: '#d1d5db',
      accent: '#2563eb',
    };
  }

  private isHexColor(value?: string) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
  }
}
