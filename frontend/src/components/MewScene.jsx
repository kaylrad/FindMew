import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  getMewCat,
  getMewRoom,
  mewAccessories,
  mewHomeLayers,
  mewWarmLayers,
} from '../lib/mymew-catalog';
import { mewPoseFrames, mewPoseSheets, poseLabels } from '../lib/cat-poses';
import MewAccessoryArt from './MewAccessoryArt';

const catWidth = 190.65255737304688,
  catHeight = 204.2150115966797;

export function MewRoomFill({ pet = {}, scale = 1, top = 0 }) {
  const room = getMewRoom(pet.room_id),
    warm = room.id === 'hangat';
  const backgroundScale = 453 / 393,
    backgroundTop = (857 - 852 * backgroundScale) / 2;
  const floorTop = top + (warm ? 435.5274 : backgroundTop + 433 * backgroundScale) * scale;
  const skirtingTop = top + (warm ? 435.2703 : backgroundTop + 432.721 * backgroundScale) * scale;
  const wall = warm ? '#F6EBDD' : room.id === 'senja' ? '#575965' : '#496046';
  const floor = warm ? '#EAD7BD' : room.id === 'senja' ? '#574A39' : '#78746F';
  return (
    <div
      className="mew-room-fill"
      data-mew-room={room.id}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: wall,
      }}
    >
      <div
        className="mew-room-fill-wall"
        style={{
          position: 'absolute',
          inset: 0,
          ...(warm
            ? {
                backgroundImage: 'url(/mymew/home-Vector.svg)',
                backgroundRepeat: 'repeat-x',
                backgroundSize: 633.9735 * scale + 'px ' + 514.0286 * scale + 'px',
                backgroundPosition: 'center ' + (top - 15.0832 * scale) + 'px',
              }
            : { background: wall }),
        }}
      />
      <div
        className="mew-room-fill-floor"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: floorTop,
          bottom: 0,
          background: floor,
        }}
      />
      <div
        className="mew-room-fill-skirting"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: skirtingTop,
          height: (warm ? 5.3991 : 5.353 * backgroundScale) * scale,
          background: '#DDC4A4',
        }}
      />
    </div>
  );
}

function OriginalLayers({ layers }) {
  return layers.map((layer) => (
    <div
      key={layer.id}
      data-figma-layer={layer.id}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        pointerEvents: 'none',
      }}
    >
      <div style={{ position: 'absolute', inset: layer.inner }}>
        <img
          src={layer.src}
          alt=""
          draggable="false"
          style={{ display: 'block', maxWidth: 'none', pointerEvents: 'none' }}
        />
      </div>
    </div>
  ));
}

export function MewCat({
  catId = 'oyen',
  equipped = [],
  pose = 'idle',
  className = '',
  style = {},
  label,
}) {
  const cat = getMewCat(catId),
    frame = mewPoseFrames[pose] || mewPoseFrames.idle;
  const width = Number(style.width) || catWidth,
    height = Number(style.height) || catHeight;
  const scale = Math.min(width / frame.width, height / frame.height);
  const worn = mewAccessories.filter((item) =>
    equipped.some((entry) => (entry.product_id || entry.id) === item.id)
  );
  return (
    <div
      className={'mew-cat ' + className}
      role="img"
      data-mew-pose={pose}
      data-mew-cat={cat.id}
      aria-label={
        (label || 'Kucing ' + cat.name) +
        ' sedang ' +
        poseLabels[pose] +
        (worn.length ? ', memakai ' + worn.map((item) => item.name).join(' dan ') : '')
      }
      style={{ position: 'relative', width, height, overflow: 'visible', ...style }}
    >
      <div
        className="mew-cat-pose-frame"
        style={{
          position: 'absolute',
          left: (width - frame.width * scale) / 2,
          top: height - frame.height * scale,
          width: frame.width,
          height: frame.height,
          transform: 'scale(' + scale + ')',
          transformOrigin: 'top left',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img
            data-mew-pose-sheet={cat.id}
            src={mewPoseSheets[cat.id]}
            alt=""
            draggable="false"
            style={{
              position: 'absolute',
              left: -frame.x,
              top: -frame.y,
              width: 832,
              height: 525,
              maxWidth: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
        {worn.map((item) => {
          const hat = item.slot === 'head',
            itemWidth = (frame.headWidth * (hat ? 106 : 130)) / 143.307312;
          const ratio = item.artWidth / item.artHeight;
          const centerX = frame.eyesX - frame.headWidth * (hat ? 0.045 : 0.02);
          const centerY = hat
            ? frame.eyesY - frame.headWidth * 0.12 - itemWidth / ratio / 2
            : frame.eyesY + frame.headWidth * 0.04;
          return (
            <MewAccessoryArt
              key={item.id}
              item={item}
              alt=""
              data-mew-accessory={item.id}
              style={{
                position: 'absolute',
                left: centerX - itemWidth / 2,
                top: centerY - itemWidth / ratio / 2,
                width: itemWidth,
                height: 'auto',
                pointerEvents: 'none',
                transform: 'rotate(' + frame.angle + 'deg)',
                transformOrigin: '50% 50%',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function MewScene({
  pet = {},
  equipped = [],
  variant = 'home',
  pose = pet.energy < 30 ? 'sleep' : 'idle',
  className = '',
  children,
  style = {},
}) {
  const preview = variant === 'preview',
    width = preview ? 393 : 453,
    height = preview ? 492 : 857;
  const container = useRef(null),
    [scale, setScale] = useState(1);
  const room = getMewRoom(pet.room_id);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const update = () => setScale(node.getBoundingClientRect().width / width);
    update();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [width]);
  const catPosition = preview
    ? { left: 114, top: 258, width: catWidth, height: catHeight }
    : { left: 128, top: 335, width: 235, height: 240 };
  const backgroundScale = preview ? 1 : width / 393,
    backgroundTop = preview ? -80 : (height - 852 * backgroundScale) / 2;
  const bowlBottom = room.id === 'hangat' ? 740.27 : backgroundTop + 736 * backgroundScale;
  return (
    <div
      ref={container}
      className={'mew-scene ' + className}
      data-mew-room={room.id}
      data-mew-variant={variant}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: width + '/' + height,
        overflow: 'hidden',
        background: '#ead7b8',
        ...style,
      }}
    >
      <div
        className="mew-scene-canvas"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width,
          height,
          transform: 'scale(' + scale + ')',
          transformOrigin: 'top left',
        }}
      >
        <div
          aria-hidden="true"
          className="mew-scene-background"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {room.id === 'hangat' ? (
            preview ? (
              <div style={{ position: 'absolute', left: 0, top: -80, width: 393, height: 852 }}>
                <OriginalLayers layers={mewWarmLayers} />
              </div>
            ) : (
              <OriginalLayers layers={mewHomeLayers} />
            )
          ) : (
            <img
              src={room.sceneSrc}
              alt=""
              draggable="false"
              style={{
                position: 'absolute',
                left: 0,
                top: backgroundTop,
                width: 393,
                height: 852,
                maxWidth: 'none',
                transform: 'scale(' + backgroundScale + ')',
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
        <MewCat
          catId={pet.cat_type_id}
          equipped={equipped}
          pose={pose}
          label={(pet.name || 'MyMew') + ' · ' + getMewCat(pet.cat_type_id).name}
          style={{ position: 'absolute', ...catPosition }}
        />
        {!preview && pose === 'happy' && (
          <img
            src="/mymew/revision-foodFull.svg"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 272,
              top: bowlBottom - 95.0704,
              width: 195.954,
              height: 'auto',
              pointerEvents: 'none',
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}

const warmParts = {
  window: { x: -16, y: 207, width: 158, height: 165, layers: mewHomeLayers.slice(4, 11) },
  picture: { x: 334, y: 287, width: 102, height: 76, layers: mewHomeLayers.slice(11, 16) },
  plant: { x: 354, y: 361, width: 65, height: 88, layers: mewHomeLayers.slice(16, 19) },
  books: { x: -13, y: 389, width: 72, height: 77, layers: mewHomeLayers.slice(19, 23) },
  rug: { x: 27, y: 514, width: 422, height: 100, layers: mewHomeLayers.slice(23, 26) },
};
const otherParts = {
  window: { x: 0, y: 205, width: 125, height: 165 },
  picture: { x: 289, y: 287, width: 94, height: 75 },
  plant: { x: 306, y: 361, width: 60, height: 86 },
  books: { x: 0, y: 386, width: 60, height: 77 },
  rug: { x: 23, y: 510, width: 367, height: 100 },
};
function RoomDecoration({ room, part, scale, left, top }) {
  const region = (room.id === 'hangat' ? warmParts : otherParts)[part];
  return (
    <div
      className={'mew-room-decoration mew-room-' + part}
      data-mew-decoration={part}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left,
        top,
        width: region.width * scale,
        height: region.height * scale,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: region.width,
          height: region.height,
          transform: 'scale(' + scale + ')',
          transformOrigin: 'top left',
        }}
      >
        {room.id === 'hangat' ? (
          <div
            style={{
              position: 'absolute',
              left: -region.x,
              top: -region.y,
              width: 453,
              height: 857,
            }}
          >
            <OriginalLayers layers={region.layers} />
          </div>
        ) : (
          <img
            src={room.sceneSrc}
            alt=""
            draggable="false"
            style={{
              position: 'absolute',
              left: -region.x,
              top: -region.y,
              width: 393,
              height: 852,
              maxWidth: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}

export function MewHomeRoom({ pet = {}, equipped = [], pose = 'idle', children }) {
  const area = useRef(null),
    [size, setSize] = useState({ width: 390, height: 620 });
  const room = getMewRoom(pet.room_id);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      );
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const { width, height } = size,
    compact = height < 320;
  const decorScale = Math.max(0.38, Math.min(1.45, width / 560, height / 520));
  const floorY = compact
    ? height * 0.55
    : Math.max(height * 0.61, Math.min(height * 0.69, 176 + 168 * decorScale));
  const catSize = Math.min(
    compact ? width * 0.26 : width * 0.54,
    height * (compact ? 0.7 : 0.5),
    compact ? 430 : ((height - 170) * 235) / 240,
    430
  );
  const cat = {
    width: catSize,
    height: (catSize * 240) / 235,
    left: width * (compact ? 0.48 : width < 600 ? 0.34 : 0.42) - catSize / 2,
    top: Math.max(compact ? 0 : 170, height * (compact ? 0.92 : 0.82) - (catSize * 240) / 235),
  };
  const bowlWidth = Math.max(88, Math.min(220, width * 0.32, height * 0.25));
  const bowl = {
    left: width - Math.max(14, width * 0.08) - bowlWidth,
    top: height - ((bowlWidth * 95.0704) / 195.954 + 72) - 12,
    width: bowlWidth,
  };
  const originalFloor =
    room.id === 'hangat' ? 435.5274 : (857 - 852 * (453 / 393)) / 2 + 433 * (453 / 393);
  const parts = room.id === 'hangat' ? warmParts : otherParts;
  const rightMargin = compact ? width * 0.22 : Math.max(66, width * 0.12);
  const rugWidth = Math.min(width * 0.85, catSize * 1.5),
    rugScale = rugWidth / parts.rug.width;
  return (
    <>
      <MewRoomFill pet={pet} scale={decorScale} top={floorY - originalFloor * decorScale} />
      <div
        ref={area}
        className={'mew-home-scene-area' + (compact ? ' mew-home-compact' : '')}
        data-mew-responsive-room={room.id}
      >
        {room.id === 'hangat' && (
          <div
            aria-hidden="true"
            className="mew-room-floor-lines"
            style={{
              position: 'absolute',
              left: 0,
              top: floorY + 4,
              width,
              height: Math.max(0, height - floorY),
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <img
              src="/mymew/home-Vector3.svg"
              alt=""
              style={{ display: 'block', width, height: 'auto' }}
            />
          </div>
        )}
        <RoomDecoration
          room={room}
          part="window"
          scale={decorScale}
          left={compact ? width * 0.28 : Math.max(12, width * 0.08)}
          top={compact ? floorY - 228 * decorScale : Math.max(166, floorY - 228 * decorScale)}
        />
        <RoomDecoration
          room={room}
          part="picture"
          scale={decorScale}
          left={width - rightMargin - parts.picture.width * decorScale}
          top={floorY - 145 * decorScale}
        />
        <RoomDecoration
          room={room}
          part="plant"
          scale={decorScale}
          left={width - rightMargin - parts.plant.width * decorScale}
          top={floorY - ((room.id === 'hangat' ? 435.5274 : 433) - parts.plant.y) * decorScale}
        />
        <RoomDecoration
          room={room}
          part="books"
          scale={decorScale}
          left={compact ? width * 0.19 : Math.max(0, width * 0.04)}
          top={floorY - ((room.id === 'hangat' ? 435.5274 : 433) - parts.books.y) * decorScale}
        />
        <RoomDecoration
          room={room}
          part="rug"
          scale={rugScale}
          left={cat.left + catSize / 2 - rugWidth / 2}
          top={cat.top + cat.height - parts.rug.height * rugScale * 0.64}
        />
        <MewCat
          catId={pet.cat_type_id}
          equipped={equipped}
          pose={pose}
          label={(pet.name || 'MyMew') + ' · ' + getMewCat(pet.cat_type_id).name}
          style={{ position: 'absolute', ...cat }}
        />
        {typeof children === 'function' ? children({ cat, bowl, compact }) : children}
      </div>
    </>
  );
}
export default MewScene;
