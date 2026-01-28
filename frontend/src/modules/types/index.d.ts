// Extend HTML input element to include webkitdirectory attribute
import * as React from 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
  }
}