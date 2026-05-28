import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Authentication from '../src/webApi/authentication.js';
import Functions from '../src/functions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.functions = new Functions();

    //clear web api token
    this.onRequest('/clearToken', this.clearToken.bind(this));

    //start console authorization
    this.onRequest('/startAuthorization', this.startAuthorization.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

  async writeResult(result) {
    try {
      await fsPromises.writeFile(
        join(__dirname, 'public', '_result.json'),
        JSON.stringify({ ...result, ts: Date.now() })
      );
    } catch (_) {}
  }

  async clearToken(payload) {
    const hostKey = payload.host.replace(/\./g, '');
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${hostKey}`;

    try {
      const emptyTokens = { oauth: {}, user: {}, xsts: {} };
      await this.functions.saveData(tokensFile, emptyTokens);
      await this.writeResult({ ok: true });
      return true;
    } catch (error) {
      await this.writeResult({ ok: false, error: error?.message ?? error });
      throw new Error(`Clear token error: ${error?.message ?? error}`);
    }
  }

  async startAuthorization(payload) {
    const hostKey = payload.host.replace(/\./g, '');
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${hostKey}`;

    const authConfig = {
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      tokensFile
    };

    const authentication = new Authentication(authConfig);

    // Accept both the raw code and the full callback URL; also URL-decode in case
    // the user copied the code directly from the browser address bar (%24 → $ etc.)
    let webApiToken = payload.token;
    if (webApiToken?.includes('?code=') || webApiToken?.includes('&code=')) {
      try { webApiToken = new URL(webApiToken).searchParams.get('code') ?? webApiToken; } catch (_) {}
    }
    try { webApiToken = decodeURIComponent(webApiToken); } catch (_) {}

    try {
      // Case: Console already authorized
      await authentication.checkAuthorization();
      const response = {
        info: 'Console authorized and activated. To start a new process, please clear the Web API Token first.',
        status: 0
      };
      await this.writeResult({ ok: true, data: response });
      return response;
    } catch {
      if (webApiToken) {
        try {
          await authentication.accessToken(webApiToken);
          const response = {
            info: 'Activation successful! Now restart the plugin and have fun!',
            status: 2
          };
          await this.writeResult({ ok: true, data: response });
          return response;
        } catch (error) {
          const msg = `Activation console error: ${error?.message ?? error}`;
          await this.writeResult({ ok: false, error: msg });
          throw new Error(msg);
        }
      }

      // No token, generate auth URL
      try {
        const oauth2URI = await authentication.generateAuthorizationUrl();
        const response = { info: oauth2URI, status: 1 };
        await this.writeResult({ ok: true, data: response });
        return response;
      } catch (error) {
        await this.writeResult({ ok: false, error: String(error) });
        throw new Error(error);
      }
    }
  }
}

(() => {
  return new PluginUiServer();
})();
