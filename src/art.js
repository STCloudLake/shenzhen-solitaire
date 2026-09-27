/* ============================================================================
 * SHENZHEN SOLITAIRE — 牌面美术（生成 SVG / HTML 片段，无外部资源）
 *   花色对应：0 筒(红)  1 索(绿)  2 萬(黑字红萬)   龙：中 / 發 / 白板   花：❀
 * ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SZArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var INK = { red: '#a8260e', green: '#0d6b47', black: '#161616', wanRed: '#b5381f' };
  var CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var DRAGON = ['中', '發', '白'];

  var W = 92, H = 184;
  var CX = W / 2, CY = 96;   // 中央图案中心

  /* --------------------------------------------------------------- 筒（圆饼） */

  function circlePip(x, y, r, fill) {
    var ink = fill || INK.red;
    return '<g>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + ink + '" stroke-width="' + (r * 0.30).toFixed(2) + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.46).toFixed(2) + '" fill="none" stroke="' + ink + '" stroke-width="' + (r * 0.16).toFixed(2) + '"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.15).toFixed(2) + '" fill="' + ink + '"/>' +
      '</g>';
  }

  var CIRCLE_LAYOUT = {
    1: { r: 14, pts: [[46, 96]] },
    2: { r: 11.5, pts: [[46, 74], [46, 118]] },
    3: { r: 10, pts: [[31, 73], [46, 96], [61, 119]] },
    4: { r: 10, pts: [[32, 76], [60, 76], [32, 116], [60, 116]] },
    5: { r: 9.2, pts: [[31, 73], [61, 73], [46, 96], [31, 119], [61, 119]] },
    6: { r: 8.6, pts: [[32, 70], [60, 70], [32, 96], [60, 96], [32, 122], [60, 122]] },
    7: { r: 8.0, pts: [[30, 62], [46, 74], [62, 86], [31, 112], [61, 112], [31, 134], [61, 134]] },
    8: { r: 7.6, pts: [[32, 60], [60, 60], [32, 84], [60, 84], [32, 108], [60, 108], [32, 132], [60, 132]] },
    9: { r: 7.6, pts: [[28, 66], [46, 66], [64, 66], [28, 96], [46, 96], [64, 96], [28, 126], [46, 126], [64, 126]] }
  };

  function circlesSvg(rank) {
    var L = CIRCLE_LAYOUT[rank];
    var body = L.pts.map(function (p) { return circlePip(p[0], p[1], L.r); }).join('');
    return '<svg class="pips" viewBox="0 0 ' + W + ' ' + H + '">' + body + '</svg>';
  }

  /* --------------------------------------------------------------- 索（竹节） */

  // 一根竹节：竖向圆角棒 + 两侧竹节凸起 + 中间竹节线
  function bamboo(x, y, w, h, ink) {
    var rx = w * 0.30;
    var sw = Math.max(1.5, w * 0.24);
    var r = sw * 0.45;
    var o = '<g transform="translate(' + x + ',' + y + ')">';
    o += '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + rx +
      '" ry="' + rx + '" fill="none" stroke="' + ink + '" stroke-width="' + sw.toFixed(2) + '"/>';
    [-0.24, 0.24].forEach(function (f) {
      var yy = (f * h).toFixed(2);
      o += '<circle cx="' + (-w / 2) + '" cy="' + yy + '" r="' + r.toFixed(2) + '" fill="' + ink + '"/>';
      o += '<circle cx="' + (w / 2) + '" cy="' + yy + '" r="' + r.toFixed(2) + '" fill="' + ink + '"/>';
      o += '<line x1="' + (-w / 2).toFixed(2) + '" y1="' + yy + '" x2="' + (w / 2).toFixed(2) + '" y2="' + yy +
        '" stroke="' + ink + '" stroke-width="' + (sw * 0.55).toFixed(2) + '"/>';
    });
    o += '</g>';
    return o;
  }

  var BAMBOO_LAYOUT = {
    1: { w: 19, h: 54, pts: [[46, 96]] },
    2: { w: 15, h: 40, pts: [[46, 72], [46, 120]] },
    3: { w: 14, h: 36, pts: [[46, 64], [35, 122], [57, 122]] },
    4: { w: 13, h: 34, pts: [[35, 74], [57, 74], [35, 118], [57, 118]] },
    5: { w: 12, h: 32, pts: [[34, 71], [58, 71], [46, 96], [34, 121], [58, 121]] },
    6: { w: 11.5, h: 32, pts: [[31, 74], [46, 74], [61, 74], [31, 118], [46, 118], [61, 118]] },
    7: { w: 10.5, h: 27, pts: [[46, 58], [31, 92], [46, 92], [61, 92], [31, 126], [46, 126], [61, 126]] },
    8: { w: 9.6, h: 30, pts: [[27, 76], [39.7, 76], [52.3, 76], [65, 76], [27, 116], [39.7, 116], [52.3, 116], [65, 116]] },
    9: { w: 10, h: 25, pts: [[30, 68], [46, 68], [62, 68], [30, 96], [46, 96], [62, 96], [30, 124], [46, 124], [62, 124]] }
  };

  function bambooSvg(rank) {
    var L = BAMBOO_LAYOUT[rank];
    var body = L.pts.map(function (p) { return bamboo(p[0], p[1], L.w, L.h, INK.green); }).join('');
    return '<svg class="pips" viewBox="0 0 ' + W + ' ' + H + '">' + body + '</svg>';
  }

  /* --------------------------------------------------------------- 萬（汉字） */

  function wanSvg(rank) {
    return '<div class="wan">' +
      '<span class="wan-num">' + CN[rank - 1] + '</span>' +
      '<span class="wan-char">萬</span>' +
      '</div>';
  }

  /* --------------------------------------------------------------- 角标图形 */

  function cornerGlyph(suit) {
    if (suit === 0) {
      return '<svg class="csvg" viewBox="0 0 20 20">' +
        '<circle cx="10" cy="10" r="6.4" fill="none" stroke="' + INK.red + '" stroke-width="2"/>' +
        '<circle cx="10" cy="10" r="2.6" fill="none" stroke="' + INK.red + '" stroke-width="1.2"/>' +
        '<circle cx="10" cy="10" r="0.9" fill="' + INK.red + '"/></svg>';
    }
    if (suit === 1) {
      return '<svg class="csvg" viewBox="0 0 20 20">' +
        bamboo(7, 10, 4.4, 13, INK.green) + bamboo(13, 10, 4.4, 13, INK.green) + '</svg>';
    }
    return '<span class="cchar">萬</span>';
  }

  /* --------------------------------------------------------------- 中央图案 */

  function centerArt(c) {
    if (c.rank === 'F') return flowerSvg('big');
    if (c.rank === 'D') {
      if (c.suit === 2) {
        // 白板：空心方框
        return '<svg class="pips" viewBox="0 0 ' + W + ' ' + H + '">' +
          '<rect x="23" y="56" width="46" height="78" rx="6" fill="none" stroke="' + INK.black + '" stroke-width="3"/>' +
          '<rect x="32" y="66" width="28" height="58" rx="4" fill="none" stroke="' + INK.black + '" stroke-width="2"/></svg>';
      }
      var ink = c.suit === 0 ? INK.red : INK.green;
      return '<div class="dragon" style="color:' + ink + '">' + DRAGON[c.suit] + '</div>';
    }
    if (c.suit === 0) return circlesSvg(c.rank);
    if (c.suit === 1) return bambooSvg(c.rank);
    return wanSvg(c.rank);
  }

  /* --------------------------------------------------------------- 花牌 */

  function flowerSvg(kind) {
    if (kind === 'small') {
      return '<svg class="csvg flower" viewBox="0 0 24 24">' +
        '<g transform="translate(12,12)" fill="none" stroke="' + INK.red + '" stroke-width="1.3">' +
        petal(0, -4.4) + petal(4.2, -1.4) + petal(2.6, 3.6) + petal(-2.6, 3.6) + petal(-4.2, -1.4) +
        '</g>' +
        '<path d="M12 15.5 L12 21" stroke="' + INK.green + '" stroke-width="1.4" fill="none"/>' +
        '<path d="M12 18.5 Q8.5 17.5 8 20.5" stroke="' + INK.green + '" stroke-width="1.2" fill="none"/>' +
        '</svg>';
    }
    return '<svg class="pips" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<g transform="translate(' + CX + ',84) scale(2.5)" fill="none" stroke="' + INK.red + '" stroke-width="1.5">' +
      petal(0, -4.4) + petal(4.2, -1.4) + petal(2.6, 3.6) + petal(-2.6, 3.6) + petal(-4.2, -1.4) +
      '<circle cx="0" cy="0" r="1.5" stroke-width="1.1"/>' +
      '</g>' +
      '<g stroke="' + INK.green + '" fill="none" stroke-width="2.6">' +
      '<path d="M' + CX + ' 106 L' + CX + ' 142"/>' +
      '<path d="M' + CX + ' 122 Q30 112 24 132"/>' +
      '<path d="M' + CX + ' 130 Q62 120 68 140"/>' +
      '</g></svg>';
  }
  function petal(x, y) {
    var cx = x * 1.9, cy = y * 1.9;
    return '<ellipse cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" rx="3.1" ry="4.2" ' +
      'transform="rotate(' + (Math.atan2(y, x) * 180 / Math.PI + 90).toFixed(1) + ' ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ')"/>';
  }

  /* --------------------------------------------------------------- 整张牌 */

  function corner(invert, c) {
    var cls = invert ? 'corner tl' : 'corner br';
    var num = '';
    var glyph = '';
    if (c.rank === 'F') {
      num = '';
      glyph = flowerSvg('small');
    } else if (c.rank === 'D') {
      num = '';
      glyph = c.suit === 2
        ? '<svg class="csvg" viewBox="0 0 20 20"><rect x="6.5" y="2.5" width="7" height="15" rx="1.5" fill="none" stroke="' + INK.black + '" stroke-width="2"/>' +
          '<rect x="8.6" y="4.6" width="2.8" height="10.8" rx="1" fill="none" stroke="' + INK.black + '" stroke-width="1"/></svg>'
        : '<span class="cchar" style="color:' + (c.suit === 0 ? INK.red : INK.green) + '">' + DRAGON[c.suit] + '</span>';
    } else {
      num = '<span class="cnum">' + c.rank + '</span>';
      glyph = cornerGlyph(c.suit);
    }
    return '<div class="' + cls + '">' + num + glyph + '</div>';
  }

  // 返回牌元素内部 HTML
  function cardFace(c) {
    var cls = ['card'];
    cls.push(c.suit === 0 ? 's-red' : c.suit === 1 ? 's-green' : 's-black');
    if (c.rank === 'D') cls.push('is-dragon');
    if (c.rank === 'F') cls.push('is-flower');
    if (c.suit === 2 && c.rank !== 'D' && c.rank !== 'F') cls.push('is-wan');
    return {
      className: cls.join(' '),
      html: corner(true, c) + centerArt(c) + corner(false, c)
    };
  }

  return {
    INK: INK, CN: CN, DRAGON: DRAGON,
    CARD_W: W, CARD_H: H,
    cardFace: cardFace,
    flowerSvg: flowerSvg,
    cornerGlyph: cornerGlyph
  };
});
