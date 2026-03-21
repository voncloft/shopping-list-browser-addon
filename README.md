# walmart_price_updater

Firefox WebExtension for Walmart product pages. It reads the current page price from your normal browser session and builds:

```sql
UPDATE items SET price=8.42 WHERE ID=440;
```

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click `Load Temporary Add-on...`
3. Select [`manifest.json`](/home/von/walmart_price_updater/manifest.json)

If the addon is already loaded, remove it and load it again to pick up new changes.
The popup now shows the addon version so you can confirm Firefox is using the updated copy.

## Use

1. From your shopping site, click a Walmart link that includes either:
   `#id=440`
   or
   `#dbid=440`
   Example:
   `https://www.walmart.com/ip/...#id=440`
2. The addon now watches clicks on `voncloft.shopping.com` and remembers that `dbid` by Walmart item ID.
3. When the Walmart page opens, the popup should auto-fill the database ID even if Walmart strips the URL hash.
4. Make sure the correct store-specific price is visible on the page.
5. Click the extension button.
6. If the link includes `#dbid=...`, the addon fills `items.ID` automatically.
   Otherwise enter your `items.ID`.
7. Click `Save Current Item`.
8. Repeat for other Walmart items.
9. Use `Copy All` or `Download TXT` to get the SQL update lines.

## Files

- [`manifest.json`](/home/von/walmart_price_updater/manifest.json)
- [`content-script.js`](/home/von/walmart_price_updater/content-script.js)
- [`popup.html`](/home/von/walmart_price_updater/popup.html)
- [`popup.css`](/home/von/walmart_price_updater/popup.css)
- [`popup.js`](/home/von/walmart_price_updater/popup.js)
# shopping-list-browser-addon
