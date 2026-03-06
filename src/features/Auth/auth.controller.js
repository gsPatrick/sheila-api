const authService = require('./auth.service');

class AuthController {
    async login(req, res) {
        const { email, password } = req.body;

        try {
            const data = await authService.authenticate(email, password);
            return res.json(data);
        } catch (error) {
            return res.status(401).json({ error: error.message });
        }
    }
}

module.exports = new AuthController();
