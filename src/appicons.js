import { readFile } from 'fs/promises';
import axios from 'axios';

// Icons of the console apps for Home Assistant.
// Store apps and games: the logo or box art from the public Microsoft Store catalog, no sign in needed.
// Dashboard, Settings and the other system menus are not in the Store, they use icons bundled with the plugin,
// Material Design Icons (Apache 2.0, https://pictogrammers.com) rendered to PNG in /icons
const IconsDir = new URL('../icons/', import.meta.url);
const CatalogUrl = 'https://displaycatalog.mp.microsoft.com/v7.0/products';
const ImagePurposes = ['Logo', 'BoxArt', 'FeaturePromotionalSquareArt', 'Tile', 'Poster'];
const MaxCachedImages = 200;

const MenuIcons = {
    'Screensaver': 'monitor-shimmer',
    'Dashboard': 'view-dashboard',
    'Settings': 'cog',
    'Television': 'television-classic',
    'SettingsTv': 'tune-vertical',
    'Accessory': 'microsoft-xbox-controller',
    'NetworkTroubleshooter': 'lan-check',
    'MicrosoftStore': 'shopping',
    'XboxGuide': 'microsoft-xbox'
};

class AppIconsStore {
    constructor() {
        this.client = axios.create({ timeout: 10000 });
        this.bundled = new Map();
        // Product id to image url, null when the catalog has no image
        this.urls = new Map();
        this.images = new Map();
    }

    async bundledIcon(name) {
        if (!this.bundled.has(name)) this.bundled.set(name, await readFile(new URL(`${name}.png`, IconsDir)).catch(() => null));
        return this.bundled.get(name);
    }

    async imageUrl(productId) {
        if (this.urls.has(productId)) return this.urls.get(productId);

        const { data } = await this.client.get(CatalogUrl, { params: { bigIds: productId, market: 'US', languages: 'en-US' } });
        const images = data?.Products?.[0]?.LocalizedProperties?.[0]?.Images ?? [];
        const image = ImagePurposes.map(purpose => images.find(i => i.ImagePurpose === purpose && i.Uri)).find(Boolean);
        const url = image ? `${image.Uri.startsWith('//') ? 'https:' : ''}${image.Uri}?w=256&h=256` : null;
        this.urls.set(productId, url);
        return url;
    }

    // PNG or JPEG bytes of an app (input with oneStoreProductId, isGame), the bundled icon when there is no Store image
    async get(input) {
        const productId = String(input?.oneStoreProductId ?? '');
        if (MenuIcons[productId]) return this.bundledIcon(MenuIcons[productId]);

        const fallback = () => this.bundledIcon(input?.isGame ? 'gamepad-variant' : 'application');
        if (!productId) return fallback();
        if (this.images.has(productId)) return this.images.get(productId) ?? fallback();

        let image = null;
        try {
            const url = await this.imageUrl(productId);
            if (url) {
                const { data } = await this.client.get(url, { responseType: 'arraybuffer' });
                image = Buffer.from(data);
            }
        } catch {
            // Network error, not cached so the next request tries again
            return fallback();
        }

        this.images.set(productId, image);
        while (this.images.size > MaxCachedImages) this.images.delete(this.images.keys().next().value);
        return image ?? fallback();
    }
}

export default new AppIconsStore();
