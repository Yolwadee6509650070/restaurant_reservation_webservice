// __tests__/unit/greeting.test.js
const { getGreeting } = require('../../src/index'); // Import เฉพาะฟังก์ชัน getGreeting

describe('Unit Test: getGreeting function', () => {
    test('should return a welcome message with the given name', () => {
        expect(getGreeting('Alice')).toBe('Welcome, Alice!');
    });

    test('should return a welcome message for a different name', () => {
        expect(getGreeting('Bob')).toBe('Welcome, Bob!');
    });

    test('should return "Welcome, !" when an empty string is provided', () => {
        expect(getGreeting('')).toBe('Welcome, !');
    });

    test('should handle null input gracefully', () => {
        // Depending on desired behavior, you might want it to throw an error or handle specifically
        expect(getGreeting(null)).toBe('Welcome, null!');
    });

    test('should handle undefined input gracefully', () => {
        expect(getGreeting(undefined)).toBe('Welcome, undefined!');
    });
});