import React from 'react';

export function mewAccessoryAspect(item) {
  const width = Number.parseFloat(item.artWidth),
    height = Number.parseFloat(item.artHeight);
  return width > 0 && height > 0 ? width / height : item.slot === 'head' ? 1.5 : 3.5;
}

// Positions refer to the unmodified exported SVG, including its original stroke bounds.
export function MewAccessoryArt({
  item,
  className = '',
  style = {},
  alt = item.name || '',
  ...props
}) {
  const artWidth = Number.parseFloat(item.artWidth),
    artHeight = Number.parseFloat(item.artHeight);
  const hasDimensions = artWidth > 0 && artHeight > 0;
  return (
    <div
      {...props}
      className={'mew-accessory-graphic ' + className}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-mew-accessory-art={item.id}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: hasDimensions ? artWidth + '/' + artHeight : undefined,
        lineHeight: 0,
        overflow: 'visible',
        ...style,
      }}
    >
      <img
        src={item.src}
        alt=""
        draggable="false"
        data-mew-accessory-base={item.id}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
      {hasDimensions &&
        (item.overlays || []).map((overlay, index) => (
          <img
            key={overlay.src + '-' + index}
            src={overlay.src}
            alt=""
            draggable="false"
            data-mew-accessory-overlay={index}
            style={{
              position: 'absolute',
              display: 'block',
              left: (overlay.x / artWidth) * 100 + '%',
              top: (overlay.y / artHeight) * 100 + '%',
              width: (overlay.width / artWidth) * 100 + '%',
              height: (overlay.height / artHeight) * 100 + '%',
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: 'cover',
              pointerEvents: 'none',
            }}
          />
        ))}
    </div>
  );
}

export default MewAccessoryArt;
