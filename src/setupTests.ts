import '@testing-library/jest-dom/vitest';

// jsdom 缺少 ResizeObserver（Radix UI 组件在表单内渲染时依赖），提供空实现
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
