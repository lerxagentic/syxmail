/**
 * Generates a random username string.
 * @param {number} minLen Minimum length required (default 8)
 * @returns {string} Random username starting with a lowercase letter
 */
export function generateRandomUsername(minLen = 8) {
    const length = Math.max(8, minLen || 8);
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = letters.charAt(Math.floor(Math.random() * letters.length));
    for (let i = 1; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generates a random code string (alphanumeric, case-sensitive).
 * @param {number} length Length of code (default 8)
 * @returns {string}
 */
export function generateRandomCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
