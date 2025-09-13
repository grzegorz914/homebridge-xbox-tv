import { promises as fsPromises } from 'fs';
import QueryString from 'querystring';
import axios from 'axios';
import { WebApi } from '../constants.js';
import Functions from '../functions.js';

class Authentication {
    constructor(config) {
        this.webApiClientId = config.webApiClientId || WebApi.ClientId;
        this.webApiClientSecret = config.webApiClientSecret;
        this.tokensFile = config.tokensFile;
        this.tokens = {
            oauth: {},
            user: {},
            xsts: {}
        }

        this.functions = new Functions();
    }

    async refreshToken(token) {
        try {
            const payload = {
                "client_id": this.webApiClientId,
                "grant_type": "refresh_token",
                "scope": WebApi.Scopes,
                "refresh_token": token,
            }

            if (this.webApiClientSecret) {
                payload.client_secret = this.webApiClientSecret;
            }

            const postData = QueryString.stringify(payload);
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            const response = await axios.post(WebApi.Url.RefreshToken, postData, headers);
            const refreshToken = response.data;
            refreshToken.issued = new Date().toISOString();
            this.tokens.oauth = refreshToken;
            return true;
        } catch (error) {
            throw new Error(`Refresh token error: ${error}`);
        }
    }

    async getUserToken(accessToken) {
        try {
            const payload = {
                "RelyingParty": 'http://auth.xboxlive.com',
                "TokenType": 'JWT',
                "Properties": {
                    "AuthMethod": 'RPS',
                    "SiteName": 'user.auth.xboxlive.com',
                    "RpsTicket": `d=${accessToken}`
                }
            }

            const postData = JSON.stringify(payload);
            const headers = { 'Content-Type': 'application/json' };
            const response = await axios.post(WebApi.Url.UserToken, postData, { headers });
            const userToken = response.data;
            this.tokens.user = userToken;
            this.tokens.xsts = {};
            return true;
        } catch (error) {
            throw new Error(`User token error: ${error}`);
        }
    }

    async getXstsToken(userToken) {
        try {
            const payload = {
                "RelyingParty": 'http://xboxlive.com',
                "TokenType": 'JWT',
                "Properties": {
                    "UserTokens": [userToken],
                    "SandboxId": 'RETAIL',
                }
            }

            const postData = JSON.stringify(payload);
            const headers = { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' };
            const response = await axios.post(WebApi.Url.XstsToken, postData, headers);
            const xstsToken = response.data;
            this.tokens.xsts = xstsToken;
            return true;
        } catch (error) {
            throw new Error(`Xsts token error: ${error}`);
        }
    }

    async accessToken(webApiToken) {
        try {
            const payload = {
                "client_id": this.webApiClientId,
                "grant_type": 'authorization_code',
                "scope": WebApi.Scopes,
                "code": webApiToken,
                "redirect_uri": WebApi.Url.Redirect
            }

            if (this.webApiClientSecret) {
                payload.client_secret = this.webApiClientSecret;
            }

            const postData = QueryString.stringify(payload);
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
            const response = await axios.post(WebApi.Url.AccessToken, postData, headers);
            const accessToken = response.data;
            accessToken.issued = new Date().toISOString();
            this.tokens.oauth = accessToken;
            await this.functions.saveData(this.tokensFile, this.tokens);
            return true;
        } catch (error) {
            throw new Error(`Access token error: ${error}`);
        }
    }

    async refreshTokens(type) {
        switch (type) {
            case 'user':
                if (this.tokens.user.Token) {
                    const tokenExpired = new Date() > new Date(this.tokens.user.NotAfter).getTime();
                    switch (tokenExpired) {
                        case true:
                            try {
                                await this.refreshToken(this.tokens.oauth.refresh_token);
                                await this.getUserToken(this.tokens.oauth.access_token);
                                await this.refreshTokens('xsts');
                                return true;
                            } catch (error) {
                                throw new Error(error);
                            };
                        case false:
                            try {
                                await this.refreshTokens('xsts');
                                return true;
                            } catch (error) {
                                throw new Error(error);
                            };
                    }
                } else {
                    try {
                        await this.getUserToken(this.tokens.oauth.access_token);
                        await this.refreshTokens('xsts');
                        return true;
                    } catch (error) {
                        throw new Error(error);
                    }
                }
            case 'xsts':
                if (this.tokens.xsts.Token) {
                    const tokenExpired = new Date() > new Date(this.tokens.xsts.NotAfter).getTime();
                    switch (tokenExpired) {
                        case true:
                            try {
                                await this.getXstsToken(this.tokens.user.Token);
                                await this.refreshTokens('xsts');
                                return true;
                            } catch (error) {
                                throw new Error(error);
                            };
                        case false:
                            return true;
                    }
                } else {
                    try {
                        await this.getXstsToken(this.tokens.user.Token);
                        return true;
                    } catch (error) {
                        throw new Error(error);
                    }
                }
            default:
                throw new Error(`Unknow refresh token type: ${type}`);
        }
    }

    async checkAuthorization() {
        if (this.webApiClientId) {
            try {
                const data = await this.functions.readData(this.tokensFile);
                const tokens = data.length > 0 ? JSON.parse(data) : false;
                this.tokens = !tokens ? this.tokens : tokens;
                const refreshToken = this.tokens.oauth.refresh_token ?? false;

                if (refreshToken) {
                    await this.refreshTokens('user');
                    await this.functions.saveData(this.tokensFile, this.tokens);
                    return { headers: `XBL3.0 x=${this.tokens.xsts.DisplayClaims.xui[0].uhs};${this.tokens.xsts.Token}`, tokens: this.tokens };
                } else {
                    throw new Error('No oauth token found. Use authorization manager first.')
                }
            } catch (error) {
                throw new Error(error);
            }
        } else {
            throw new Error(`Authorization not possible, check plugin settings - Client Id: ${this.webApiClientId}`);
        }
    }

    async generateAuthorizationUrl() {
        try {
            const payload = {
                "client_id": this.webApiClientId,
                "response_type": 'code',
                "approval_prompt": 'auto',
                "scope": WebApi.Scopes,
                "redirect_uri": WebApi.Url.Redirect
            }
            const params = QueryString.stringify(payload);
            const oauth2URI = `${WebApi.Url.oauth2}?${params}`;
            return oauth2URI;
        } catch (error) {
            throw new Error(`Authorization URL error: ${error}`);
        }
    }
}
export default Authentication;