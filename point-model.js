"use strict";

const pointRadians = Math.PI / 180;
const pointTurn = angle => (angle % 360 + 360) % 360;
const pointClamp = (value, min, max) => Math.max(min, Math.min(max, value));

function pointGeometry(familyName, data) {
  const {shape, diameter_mm, length_mm, bend_radius_mm, bend_deg} = data;
  const curved = shape === 'elbow';
  const vertical = familyName === 'tank';
  const radius = diameter_mm / 2;
  if ((shape !== 'cylinder' && !(curved && familyName === 'pipe')) ||
      !Number.isFinite(diameter_mm) || diameter_mm <= 0) {
    throw Error('Indica un modelo y un diámetro exterior válidos.');
  }
  if (curved && (!Number.isFinite(bend_radius_mm) || bend_radius_mm <= radius ||
      !Number.isFinite(bend_deg) || bend_deg <= 0 || bend_deg > 180)) {
    throw Error('El radio al eje debe superar la mitad del diámetro. El ángulo del codo debe estar entre 0° y 180°.');
  }
  const length = curved ? bend_radius_mm * (bend_deg * pointRadians) : length_mm;
  if (!Number.isFinite(length) || length <= 0) throw Error('Indica la longitud o altura de referencia en milímetros.');
  const scale = Math.max(length, diameter_mm, curved ? bend_radius_mm : 0);
  const wall = radius / scale;
  function center(fraction) {
    const distance = fraction * (length / scale);
    if (vertical) return [0, distance, 0];
    if (!curved) return [distance, 0, 0];
    const angle = fraction * bend_deg * pointRadians;
    return [Math.sin(angle) * (bend_radius_mm / scale), 0, 2 * Math.sin(angle / 2)**2 * (bend_radius_mm / scale)];
  }
  function normal(fraction, degrees) {
    const angle = degrees * pointRadians, sine = Math.sin(angle), cosine = Math.cos(angle);
    if (vertical) return [-sine, 0, cosine];
    const bend = curved ? fraction * bend_deg * pointRadians : 0;
    return [-Math.sin(bend) * sine, cosine, Math.cos(bend) * sine];
  }
  function surface(fraction, degrees) {
    const offset = normal(fraction, degrees);
    return center(fraction).map((value, axis) => value + wall * offset[axis]);
  }
  function capNormal(end) {
    const bend = curved ? bend_deg * pointRadians : 0;
    if (vertical) return [0, end ? 1 : -1, 0];
    return end ? [Math.cos(bend), 0, Math.sin(bend)] : [-1, 0, 0];
  }
  return {length, curved, vertical, bend: bend_deg, center, normal, surface, capNormal};
}

function checkPointLocation(equipment, location) {
  if (location === undefined) return;
  if (!location || typeof location !== 'object' || Array.isArray(location)) throw Error('Ubicación 3D inválida.');
  const model = pointGeometry(equipment.family, location);
  if (!Number.isFinite(location.position_mm) || location.position_mm < 0 || location.position_mm > model.length ||
      !Number.isFinite(location.angle_deg) || location.angle_deg < 0 || location.angle_deg >= 360) {
    throw Error('Ubica el punto dentro del tramo y usa un ángulo desde 0° hasta menos de 360°.');
  }
  if (!validText(location.reference)) throw Error('Describe el origen y la marca de 0° para poder encontrar el punto en terreno.');
}

function pointMesh(model) {
  const slices = 96;
  const rows = model.curved ? Math.max(12, Math.ceil(model.bend / 3)) : 4;
  const vertices = [], faces = [];
  function vertex(world, fraction, degrees) {
    return vertices.push({world, fraction, degrees}) - 1;
  }
  const rings = Array.from({length: rows + 1}, (_, row) =>
    Array.from({length: slices + 1}, (_, slice) => {
      const fraction = row / rows, degrees = slice * 360 / slices;
      return vertex(model.surface(fraction, degrees), fraction, degrees);
    }));
  for (let row = 0; row < rows; row++) {
    for (let slice = 0; slice < slices; slice++) {
      faces.push({
        indices: [rings[row][slice], rings[row][slice + 1], rings[row + 1][slice + 1], rings[row + 1][slice]],
        normal: model.normal((row + 0.5) / rows, (slice + 0.5) * 360 / slices),
        origin: row === 0, ring: row > 0 && row % (model.curved ? 6 : 1) === 0,
        end: row === rows - 1, zero: slice === 0, meridian: slice > 0 && slice % (slices / 4) === 0
      });
    }
  }
  for (const end of [0, 1]) {
    const ring = rings[end * rows], midpoint = vertex(model.center(end), end, 0);
    for (let slice = 0; slice < slices; slice++) {
      faces.push({indices: [ring[slice], ring[slice + 1], midpoint], normal: model.capNormal(end), cap: true});
    }
  }
  return {vertices, faces};
}

function pointCamera(yaw, pitch) {
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  return ([x, y, z]) => {
    const depth = x * sinYaw + z * cosYaw;
    return [x * cosYaw - z * sinYaw, y * cosPitch - depth * sinPitch, y * sinPitch + depth * cosPitch];
  };
}

function pointHit(patches, x, y) {
  let nearest = null;
  for (const patch of patches) {
    const [a, ...rest] = patch.screen;
    for (let i = 1; i < rest.length; i++) {
      const b = rest[i - 1], c = rest[i];
      const cross = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(cross) < 1e-9) continue;
      const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / cross;
      const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / cross;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-8) continue;
      const depth = u * a.z + v * b.z + w * c.z;
      if (!nearest || depth > nearest.depth) nearest = {
        depth, cap: patch.cap,
        fraction: u * a.fraction + v * b.fraction + w * c.fraction,
        degrees: u * a.degrees + v * b.degrees + w * c.degrees
      };
    }
  }
  return nearest;
}

function pointModelViewer(canvas, onPick, onMarkerPick) {
  const ctx = canvas.getContext('2d');
  const home = {yaw: 0.36, pitch: 0.33};
  let {yaw, pitch} = home;
  let zoom = 1, model, mesh, marker, rendered = [], frame, pointer;
  let markers = [], selectable = [];
  const extent = (positions, axis) => {
    const coordinates = positions.map(position => position[axis]);
    return [Math.min(...coordinates), Math.max(...coordinates)];
  };

  function draw() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!mesh || !ctx || !width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const rotate = pointCamera(yaw, pitch);
    const rotated = mesh.vertices.map(vertex => rotate(vertex.world));
    const [left, right] = extent(rotated, 0), [bottom, top] = extent(rotated, 1);
    const unit = Math.min((width - 46) / (right - left), (height - 48) / (top - bottom)) * zoom;
    const mapToScreen = ([x, y, z]) => ({
      x: width / 2 + (x - (left + right) / 2) * unit,
      y: height / 2 - (y - (bottom + top) / 2) * unit,
      z
    });
    const screen = rotated.map((vertex, index) => ({
      ...mapToScreen(vertex), fraction: mesh.vertices[index].fraction, degrees: mesh.vertices[index].degrees
    }));
    rendered = mesh.faces.flatMap(face => {
      const [nx, ny, nz] = rotate(face.normal);
      if (nz <= 0) return [];
      const corners = face.indices.map(index => screen[index]);
      const depth = corners.reduce((sum, corner) => sum + corner.z, 0) / corners.length;
      const light = pointClamp(nx * -0.28 + ny * 0.43 + nz * 0.75, 0, 1);
      const shade = (face.cap ? 118 : 128) + 85 * light;
      return [{...face, screen: corners, depth, color: 'rgb(' + shade + ',' + (shade + 20) + ',' + (shade + 26) + ')'}];
    }).sort((a, b) => a.depth - b.depth);

    function stroke(a, b, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const patch of rendered) {
      const [a, b, c, d] = patch.screen;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      patch.screen.slice(1).forEach(({x, y}) => ctx.lineTo(x, y));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = patch.color;
      ctx.lineWidth = 0.8;
      ctx.fill();
      ctx.stroke();
      if (patch.cap || patch.end) stroke(patch.cap ? a : d, patch.cap ? b : c, '#446675', 1);
      if (patch.origin) stroke(a, b, '#174d67', 1.5);
      if (patch.ring) stroke(a, b, '#456c7e55', 0.7);
      if (patch.zero || patch.meridian) stroke(a, d, patch.zero ? '#1b7366' : '#456c7e70', patch.zero ? 1.5 : 0.8);
    }
    function label(text, anchor, color) {
      if (anchor.x < 23 || anchor.x > width - 23 || anchor.y < 20 || anchor.y > height - 11) return;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeText(text, anchor.x, anchor.y - 6);
      ctx.fillStyle = color;
      ctx.fillText(text, anchor.x, anchor.y - 6);
    }
    if (rotate(model.normal(0.4, 0))[2] > 0.1) {
      label('0°', mapToScreen(rotate(model.surface(0.4, 0))), '#135a4f');
    }
    const origin = [0, 90, 180, 270].map(degrees => mapToScreen(rotate(model.surface(0, degrees))))
      .sort((a,b) => b.z - a.z)[0];
    const originHit = pointHit(rendered, origin.x, origin.y);
    if (!originHit || origin.z >= originHit.depth - 0.002) {
      label('Origen', origin, '#174d67');
    }
    function locateMarker(item) {
      const fraction = item.position_mm / model.length;
      const anchor = mapToScreen(rotate(model.surface(fraction, item.angle_deg)));
      const hit = pointHit(rendered, anchor.x, anchor.y);
      const visible = !hit || anchor.z >= hit.depth - 0.001 || rotate(model.normal(fraction, item.angle_deg))[2] > 0 && hit.depth - anchor.z < 0.004;
      return {item, anchor, visible};
    }
    if (onMarkerPick) {
      selectable = markers.map(locateMarker).filter(pin => pin.visible)
        .sort((a, b) => Number(a.item === marker) - Number(b.item === marker) || a.anchor.z - b.anchor.z);
      for (const {item, anchor} of selectable) {
        const selected = item === marker;
        if (selected) {
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 12, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#152b39';
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, selected ? 9 : 7.5, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        if (selected) label(item.id, {...anchor, y: anchor.y - 10}, '#152b39');
      }
    } else if (marker) {
      const {anchor, visible} = locateMarker(marker);
      ctx.setLineDash(visible ? [] : [3, 2]);
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = visible ? '#007769' : '#f6fcfc';
      ctx.strokeStyle = visible ? '#ffffff' : '#00685d';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = visible ? '#fff' : '#00685d';
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }
  function rotateBy(dx, dy) {
    yaw += dx;
    pitch = pointClamp(pitch + dy, -1.45, 1.45);
    requestDraw();
  }
  function zoomBy(factor) {
    zoom = pointClamp(zoom * factor, 0.65, 2.8);
    requestDraw();
  }
  function reset(centerOnMarker = false) {
    ({yaw, pitch} = home);
    if (model?.vertical) pitch = 0.19;
    zoom = 1;
    if (centerOnMarker && marker) {
      const [x, y, z] = model.normal(marker.position_mm / model.length, marker.angle_deg);
      if (Math.hypot(x, z) > 0.05) yaw = Math.atan2(x, z);
      pitch = model.vertical ? 0.19 : pointClamp(Math.asin(y), -1.35, 1.35);
      if (onMarkerPick && !model.vertical) yaw += 0.24;
    }
    requestDraw();
  }
  canvas.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, dragged: false};
  });
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.dragged && Math.hypot(dx, dy) < 5) return;
    pointer.dragged = true;
    yaw = pointer.yaw;
    pitch = pointer.pitch;
    rotateBy(-dx * 0.012, dy * 0.012);
  });
  canvas.addEventListener('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    if (!pointer.dragged) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left - canvas.clientLeft, y = event.clientY - rect.top - canvas.clientTop;
      if (onMarkerPick) {
        const nearest = selectable.reduceRight((best, pin) => {
          const distance = Math.hypot(x - pin.anchor.x, y - pin.anchor.y);
          return distance <= 16 && (!best || distance < best.distance) ? {id: pin.item.id, distance} : best;
        }, null);
        if (nearest) onMarkerPick(nearest.id);
      } else {
        const hit = pointHit(rendered, x, y);
        onPick(hit && !hit.cap ? {
          position_mm: Math.min(model.length, Math.round(pointClamp(hit.fraction, 0, 1) * model.length * 10) / 10),
          angle_deg: pointTurn(Math.round(hit.degrees * 10) / 10)
        } : null);
      }
    }
    pointer = null;
  });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; });
  canvas.addEventListener('keydown', event => {
    const shifts = {ArrowLeft: [-0.18, 0], ArrowRight: [0.18, 0], ArrowUp: [0, 0.18], ArrowDown: [0, -0.18]};
    if (Object.hasOwn(shifts, event.key)) rotateBy(...shifts[event.key]);
    else if (event.key === '+' || event.key === '=') zoomBy(1.2);
    else if (event.key === '-') zoomBy(1 / 1.2);
    else return;
    event.preventDefault();
  });
  const resize = new ResizeObserver(requestDraw);
  resize.observe(canvas);
  return {
    setModel(next) { model = next; mesh = pointMesh(next); requestDraw(); },
    setMarker(next) { marker = next; requestDraw(); },
    setMarkers(items, selectedId) {
      markers = items;
      marker = markers.find(item => item.id === selectedId);
      requestDraw();
    },
    reset, zoomBy, rotateBy,
    close() { resize.disconnect(); if (frame) cancelAnimationFrame(frame); }
  };
}
