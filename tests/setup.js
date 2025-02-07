require('@testing-library/jest-dom');

// Mock chrome API
global.chrome = {
  runtime: {
    lastError: null
  },
  storage: {
    sync: {
      get: jest.fn((keys, callback) => {
        if (callback) {
          if (typeof keys === 'string' || Array.isArray(keys)) {
            const result = {};
            if (Array.isArray(keys)) {
              keys.forEach(key => result[key] = global.__chromeStorageData[key]);
            } else {
              result[keys] = global.__chromeStorageData[keys];
            }
            callback(result);
          } else {
            callback(global.__chromeStorageData);
          }
          return;
        }
        return Promise.resolve(global.__chromeStorageData);
      }),
      set: jest.fn((data, callback) => {
        if (data) {
          Object.assign(global.__chromeStorageData, data);
        }
        if (callback) {
          callback();
          return;
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        if (typeof keys === 'string') {
          delete global.__chromeStorageData[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(key => delete global.__chromeStorageData[key]);
        }
        if (callback) {
          callback();
          return;
        }
        return Promise.resolve();
      })
    }
  }
};

// Initialize storage data
global.__chromeStorageData = {};

// Clear storage before each test
beforeEach(() => {
  global.__chromeStorageData = {};
});

// Mock getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
  value: (element) => ({
    ...element.style,
    color: element.style.color || 'rgb(95, 99, 104)'
  })
});

// Mock window.URL
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

// Mock window.confirm
global.confirm = jest.fn();

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
