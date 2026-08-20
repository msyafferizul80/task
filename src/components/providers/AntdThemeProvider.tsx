'use client';

import React from 'react';
import { ConfigProvider, theme } from 'antd';

export default function AntdThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#35c0ed', // Syazna World Signature Cyan
          colorPrimaryHover: '#5dd0f3',
          colorPrimaryActive: '#23a7d2',
          colorInfo: '#08366a', // Syazna Navy
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorTextBase: '#0f172a',
          colorBgBase: '#ffffff',
          fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          borderRadius: 10,
          borderRadiusLG: 14,
          borderRadiusSM: 6,
          wireframe: false,
        },
        components: {
          Button: {
            controlHeight: 38,
            controlHeightLG: 44,
            controlHeightSM: 30,
            borderRadius: 8,
            fontWeight: 600,
            primaryShadow: '0 2px 6px rgba(53, 192, 237, 0.25)',
          },
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
          },
          Table: {
            headerBg: '#f8fafc',
            headerColor: '#475569',
            headerSplitColor: '#e2e8f0',
            rowHoverBg: '#f1f5f9',
            borderRadiusLG: 12,
          },
          Modal: {
            borderRadiusLG: 16,
            headerBg: '#ffffff',
            titleColor: '#0f172a',
          },
          Tag: {
            borderRadiusSM: 6,
            fontSize: 12,
            lineHeight: 1.5,
          },
          Select: {
            controlHeight: 40,
            controlHeightLG: 46,
            borderRadius: 8,
          },
          Input: {
            controlHeight: 40,
            controlHeightLG: 46,
            borderRadius: 8,
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
