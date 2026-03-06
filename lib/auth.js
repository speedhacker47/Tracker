/**
 * Auth Utilities
 *
 * Shared JWT verification logic used by all protected API routes.
 * Extracts and validates the Bearer token from the Authorization header.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'trackpro-dev-secret-change-in-production';

/**
 * Verify the JWT token from request headers.
 *
 * @param {Request} request - Next.js request object
 * @returns {{ userId: number, email: string }} Decoded token payload
 * @throws {Error} If token is missing, malformed, or expired
 */
export function verifyToken(request) {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const err = new Error('Missing or invalid Authorization header');
        err.status = 401;
        throw err;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { userId: decoded.userId, email: decoded.email };
    } catch (jwtError) {
        const err = new Error('Invalid or expired token');
        err.status = 401;
        throw err;
    }
}

/**
 * Sign a new JWT token.
 *
 * @param {{ userId: number, email: string }} payload
 * @param {string} [expiresIn='7d']
 * @returns {string} Signed JWT
 */
export function signToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
