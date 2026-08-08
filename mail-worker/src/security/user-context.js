import JwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';

const userContext = {
	getUserId(c) {
		const user = c.get('user');
		return user ? user.userId : null;
	},

	getUser(c) {
		return c.get('user') || null;
	},

	async getToken(c) {
		const jwt = c.req.header(constant.TOKEN_HEADER);
		const result = await JwtUtils.verifyToken(c,jwt);
		return result?.token;
	},
};
export default userContext;
