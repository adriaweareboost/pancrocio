/**
 * Inline SVG brand assets for the Scan&Boost logo.
 * BRAND_SVG: white text for dark backgrounds (report header, CTA)
 * BRAND_SVG_LIGHT: dark text for light backgrounds (sidebar, mobile popup)
 */

// Scanner icon paths (shared between both variants)
const ICON_BARS_DARK_TOP = '#4D4E5C';
const ICON_BARS_LIGHT_TOP = '#83848E';
const ICON_BARS_BOTTOM = '#EB6029';

function buildBrandSvg(opts: { frameFill: string; lineFill: string; barTopFill: string; textFill: string; width: number; height: number }): string {
  const { frameFill, lineFill, barTopFill, textFill, width, height } = opts;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 52" width="${width}" height="${height}" style="vertical-align:middle">
  <!-- Scanner icon scaled to fit left side -->
  <g transform="scale(0.55) translate(2,2)">
    <path d="M18.28 46.01H10.31C7.95 46.01 6.03 44.09 6.03 41.73V33.76c0-.51-.41-.91-.91-.91s-.91.41-.91.91v7.97c0 3.37 2.74 6.11 6.11 6.11h7.97c.51 0 .91-.41.91-.91s-.41-.92-.92-.92Z" fill="${frameFill}"/>
    <path d="M47.16 32.86c-.51 0-.91.41-.91.91v7.97c0 2.36-1.92 4.28-4.28 4.28h-7.96c-.51 0-.91.41-.91.91s.41.91.91.91h7.96c3.37 0 6.11-2.74 6.11-6.11v-7.97c0-.49-.41-.9-.92-.9Z" fill="${frameFill}"/>
    <path d="M5.12 18.96c.51 0 .91-.41.91-.91V10.09c0-2.36 1.92-4.28 4.28-4.28h7.97c.51 0 .91-.41.91-.91s-.41-.91-.91-.91H10.31c-3.37 0-6.11 2.74-6.11 6.11v7.96c.01.49.42.9.92.9Z" fill="${frameFill}"/>
    <path d="M34.01 5.81h7.96c2.36 0 4.28 1.92 4.28 4.28v7.96c0 .51.41.91.91.91s.91-.41.91-.91V10.09c0-3.37-2.74-6.11-6.11-6.11H34c-.51 0-.91.41-.91.91s.41.92.92.92Z" fill="${frameFill}"/>
    <path d="M41.74 11.97c.52 0 .94.42.94.94v9.08c0 .3-.15.59-.39.76l-.02.01c-.62.44-1.47-.01-1.47-.76v-9.09c0-.52.42-.94.94-.94Z" fill="${barTopFill}"/>
    <path d="M19.78 12.91v9.2c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-9.2c0-.52.42-.94.94-.94s.94.43.94.94Z" fill="${barTopFill}"/>
    <path d="M35.05 17.51v-4.59c0-.52-.42-.94-.94-.94s-.94.42-.94.94v4.59c0 .52.42.94.94.94s.94-.42.94-.94Z" fill="${barTopFill}"/>
    <path d="M11.21 11.97c.52 0 .94.42.94.94v7.25c0 .76-.85 1.2-1.47.76l-.02-.01c-.25-.18-.39-.46-.39-.76v-7.24c0-.52.42-.94.94-.94Z" fill="${barTopFill}"/>
    <path d="M15.02 11.97c.52 0 .94.42.94.94v3.88c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-3.88c0-.51.42-.94.94-.94Z" fill="${barTopFill}"/>
    <path d="M37.92 11.97c.52 0 .94.42.94.94v6.23c0 .51-.4.94-.91.96-.54.02-.98-.41-.98-.94v-6.25c.01-.52.43-.94.95-.94Z" fill="${barTopFill}"/>
    <path d="M26.47 11.97c.52 0 .94.42.94.94v9.1c0 .26-.11.5-.28.67s-.41.28-.68.28c-.52-.01-.93-.44-.93-.96v-9.08c.01-.53.43-.95.95-.95Z" fill="${barTopFill}"/>
    <path d="M22.66 11.97c.52 0 .94.42.94.94v7.09c0 .57-.5 1-1.07.92l-.02-.01c-.46-.06-.8-.46-.8-.91v-7.09c.01-.52.43-.94.95-.94Z" fill="${barTopFill}"/>
    <path d="M30.29 11.97c.52 0 .94.42.94.94v7.44c0 .26-.11.5-.28.67s-.41.28-.68.28c-.52-.01-.93-.44-.93-.96v-7.43c.01-.52.43-.94.95-.94Z" fill="${barTopFill}"/>
    <path d="M31.23 33.54v8.42c0 .46-.34.86-.8.94l-.02.01c-.56.08-1.06-.36-1.06-.92v-8.42c0-.52.42-.94.94-.94s.94.42.94.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M41.74 22.61c.52 0 .94.42.94.94v13.82c0 .3-.15.59-.39.76l-.02.01c-.62.44-1.47-.01-1.47-.76V23.55c0-.52.42-.94.94-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M19.78 40.55v.56c0 .62-.6 1.07-1.2.89l-.02-.01c-.39-.12-.67-.48-.67-.89v-.56c0-.52.42-.94.94-.94s.95.42.95.95Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M19.78 23.55v12.89c0 .52-.42.94-.94.94s-.94-.42-.94-.94V23.55c0-.52.42-.94.94-.94s.94.42.94.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M35.05 41.04V23.55c0-.52-.42-.94-.94-.94s-.94.42-.94.94v17.49c0 .52.42.94.94.94s.94-.42.94-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M11.21 22.61c.52 0 .94.42.94.94v13.83c0 .76-.85 1.2-1.47.76l-.02-.01c-.25-.18-.39-.46-.39-.76V23.55c0-.52.42-.94.94-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M15.96 28.65v10.98c0 .69-.72 1.14-1.34.84l-.02-.01c-.32-.16-.52-.48-.52-.84V28.65c0-.52.42-.94.94-.94s.94.42.94.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M15.02 22.61c.52 0 .94.42.94.94v.98c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-.98c0-.52.42-.94.94-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M37.92 22.61c.52 0 .94.42.94.94v5.7c0 .51-.4.94-.91.96-.54.02-.98-.41-.98-.94v-5.72c.01-.52.43-.94.95-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M38.87 33.42v6.2c0 .36-.2.68-.52.84l-.02.01c-.62.3-1.34-.15-1.34-.84v-6.24c0-.26.11-.49.28-.67s.41-.28.67-.28c.5.01.93.46.93.98Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M26.47 22.61c.52 0 .94.42.94.94v12.26c0 .26-.11.5-.28.67s-.41.28-.68.28c-.52-.01-.93-.44-.93-.96V23.55c.01-.52.43-.94.95-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M27.41 39.93v2.3c0 .52-.42.94-.93.94h-.02c-.52 0-.93-.42-.93-.94v-2.27c0-.52.41-.96.92-.97.53-.01.96.41.96.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M22.66 22.61c.52 0 .94.42.94.94v18.41c0 .57-.5 1-1.07.92l-.02-.01c-.46-.06-.8-.46-.8-.92V23.55c.01-.52.43-.94.95-.94Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M30.29 22.61c.52 0 .94.42.94.94v5.87c0 .26-.11.5-.28.67s-.41.28-.68.28c-.52-.01-.93-.44-.93-.96v-5.85c.01-.53.43-.95.95-.95Z" fill="${ICON_BARS_BOTTOM}"/>
    <path d="M51.37 21.79H.91c-.5 0-.91.41-.91.92s.41.91.91.91h50.46c.51 0 .91-.41.91-.91s-.4-.92-.91-.92Z" fill="${lineFill}"/>
  </g>
  <!-- Text: Scan&Boost -->
  <text x="34" y="23" font-family="'Plus Jakarta Sans',sans-serif" font-weight="800" font-size="22" letter-spacing="-0.5" fill="${textFill}">Scan&amp;<tspan fill="#EB6029">Boost</tspan></text>
  <!-- Subtitle: by Boost -->
  <text x="130" y="44" font-family="'Plus Jakarta Sans',sans-serif" font-weight="400" font-size="9" fill="${textFill}" opacity="0.7">by <tspan font-weight="700">Boost</tspan></text>
</svg>`;
}

// For dark backgrounds (report header, CTA section)
export const BRAND_SVG = buildBrandSvg({
  frameFill: 'white',
  lineFill: 'white',
  barTopFill: ICON_BARS_DARK_TOP,
  textFill: 'white',
  width: 200,
  height: 61,
});

// For light backgrounds (sidebar, mobile popup)
export const BRAND_SVG_LIGHT = buildBrandSvg({
  frameFill: '#16162B',
  lineFill: '#16162B',
  barTopFill: ICON_BARS_LIGHT_TOP,
  textFill: '#16162B',
  width: 200,
  height: 61,
});
