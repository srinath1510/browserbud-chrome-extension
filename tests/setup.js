require('@testing-library/jest-dom');

// Mock chrome API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((keys, callback) => callback({})),
      set: jest.fn((data, callback) => callback && callback()),
      remove: jest.fn((key, callback) => callback && callback())
    }
  }
};

// Mock window.URL
global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

// Mock window.confirm
global.confirm = jest.fn();

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
