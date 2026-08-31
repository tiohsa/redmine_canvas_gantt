import type { CSSProperties } from 'react';
import { fontFamilies } from '../../styles/designTokens';

export const timerButtonLayout: CSSProperties = {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: fontFamilies.ui
};
