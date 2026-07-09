#!/usr/bin/env python3
"""Deterministic CHK (StarCraft: Brood War scenario) parser -> JSON dumps."""
import struct, sys, os, json, re

def sections(data):
    out = {}
    i = 0
    order = []
    while i + 8 <= len(data):
        name = data[i:i+4].decode('latin1').rstrip()
        sz = struct.unpack('<i', data[i+4:i+8])[0]
        if sz < 0 or i + 8 + sz > len(data):
            break
        # later sections override earlier ones (SC behaviour)
        out[name] = data[i+8:i+8+sz]
        order.append((name, sz))
        i += 8 + sz
    return out, order

CTRL = re.compile(rb'[\x01-\x1f]')
def _dec(b):
    try:
        return b.decode('utf-8')
    except UnicodeDecodeError:
        return b.decode('cp949', 'replace')

def clean(b):
    return _dec(CTRL.sub(b'', b)).strip()

def raw(b):
    return _dec(b)

def parse_strx(b):
    if len(b) < 4: return []
    n = struct.unpack('<I', b[0:4])[0]
    offs = struct.unpack('<%dI' % n, b[4:4+4*n])
    res = []
    for o in offs:
        if o >= len(b):
            res.append('')
            continue
        e = b.find(b'\x00', o)
        if e < 0: e = len(b)
        res.append(b[o:e])
    return res

def main(chk_path, outdir):
    os.makedirs(outdir, exist_ok=True)
    data = open(chk_path, 'rb').read()
    sec, order = sections(data)
    result = {}

    w, h = struct.unpack('<HH', sec['DIM'])
    era = struct.unpack('<H', sec['ERA'])[0]
    result['dim'] = {'width': w, 'height': h, 'tileset': era,
                     'tileset_name': ['Badlands','Space Platform','Installation','Ashworld','Jungle','Desert','Arctic','Twilight'][era] if era < 8 else str(era)}

    strs_raw = parse_strx(sec['STRx']) if 'STRx' in sec else parse_strx(sec['STR'])
    def S(idx):
        if idx == 0 or idx > len(strs_raw): return ''
        return clean(strs_raw[idx-1])
    def Sraw(idx):
        if idx == 0 or idx > len(strs_raw): return ''
        return raw(strs_raw[idx-1])
    result['string_count'] = len(strs_raw)

    # ---- terrain
    mtxm = sec['MTXM']
    tiles = struct.unpack('<%dH' % (len(mtxm)//2), mtxm)
    grid = [list(tiles[r*w:(r+1)*w]) for r in range(h)]
    result['terrain'] = {
        'unique_tiles': sorted(set(tiles)),
        'unique_groups': sorted(set(t >> 4 for t in tiles)),
    }
    with open(f'{outdir}/mtxm.json','w') as f:
        json.dump({'width':w,'height':h,'tiles':grid}, f)

    # ---- locations
    locs = []
    mrgn = sec['MRGN']
    for i in range(len(mrgn)//20):
        l,t,r,b,sidx,flags = struct.unpack('<IIIIHH', mrgn[i*20:(i+1)*20])
        if l==0 and t==0 and r==0 and b==0 and sidx==0: continue
        locs.append({'index': i+1, 'name': S(sidx), 'name_raw': Sraw(sidx),
                     'left':l,'top':t,'right':r,'bottom':b,
                     'tile_left':l//32,'tile_top':t//32,'tile_right':r//32,'tile_bottom':b//32,
                     'flags':flags})
    result['locations'] = locs

    # ---- placed units
    units = []
    u = sec['UNIT']
    for i in range(len(u)//36):
        rec = u[i*36:(i+1)*36]
        serial,x,y,uid,rel,vflags,vprops,owner,hp,sh,en = struct.unpack('<IHHHHHHBBBB', rec[0:20])
        res_amt, hangar, state = struct.unpack('<IHH', rec[20:28])
        units.append({'x':x,'y':y,'tile_x':x//32,'tile_y':y//32,'unit_id':uid,'owner':owner,
                      'hp_pct':hp,'resources':res_amt,'state':state})
    result['placed_units'] = units

    # ---- unit settings (UNIx)
    unix = sec['UNIx']
    N = 228
    o = 0
    use_default = list(unix[o:o+N]); o += N
    hp = list(struct.unpack('<%dI'%N, unix[o:o+4*N])); o += 4*N
    shield = list(struct.unpack('<%dH'%N, unix[o:o+2*N])); o += 2*N
    armor = list(unix[o:o+N]); o += N
    btime = list(struct.unpack('<%dH'%N, unix[o:o+2*N])); o += 2*N
    mineral = list(struct.unpack('<%dH'%N, unix[o:o+2*N])); o += 2*N
    gas = list(struct.unpack('<%dH'%N, unix[o:o+2*N])); o += 2*N
    strid = list(struct.unpack('<%dH'%N, unix[o:o+2*N])); o += 2*N
    W = 130
    wdmg = list(struct.unpack('<%dH'%W, unix[o:o+2*W])); o += 2*W
    wbonus = list(struct.unpack('<%dH'%W, unix[o:o+2*W])); o += 2*W
    ulist = []
    for i in range(N):
        if strid[i] == 0 and use_default[i] == 1:
            continue
        ulist.append({'unit_id': i, 'uses_default': bool(use_default[i]),
                      'name': S(strid[i]), 'name_raw': Sraw(strid[i]),
                      'hp': hp[i]//256, 'hp_raw': hp[i], 'shield': shield[i], 'armor': armor[i],
                      'build_time': btime[i], 'mineral': mineral[i], 'gas': gas[i]})
    result['unit_settings'] = ulist
    result['weapon_settings'] = [{'weapon_id': i, 'damage': wdmg[i], 'bonus': wbonus[i]} for i in range(W)]

    # ---- upgrades (UPGx / PUPx)
    ux = sec['UPGx']
    NU = 61
    o = 0
    ud = list(ux[o:o+NU]); o += NU + 1
    bm = list(struct.unpack('<%dH'%NU, ux[o:o+2*NU])); o+=2*NU
    fm = list(struct.unpack('<%dH'%NU, ux[o:o+2*NU])); o+=2*NU
    bg = list(struct.unpack('<%dH'%NU, ux[o:o+2*NU])); o+=2*NU
    fg = list(struct.unpack('<%dH'%NU, ux[o:o+2*NU])); o+=2*NU
    bt = list(struct.unpack('<%dH'%NU, ux[o:o+2*NU])); o+=2*NU
    ft = list(struct.unpack('<%dH'%NU, ux[o:o+2*NU])); o+=2*NU
    px = sec['PUPx']
    maxlvl = [list(px[p*NU:(p+1)*NU]) for p in range(12)]
    off = 12*NU
    startlvl = [list(px[off+p*NU:off+(p+1)*NU]) for p in range(12)]
    result['upgrades'] = [{
        'upgrade_id': i, 'uses_default': bool(ud[i]),
        'base_mineral': bm[i], 'factor_mineral': fm[i],
        'base_gas': bg[i], 'factor_gas': fg[i],
        'base_time': bt[i], 'factor_time': ft[i],
        'p1_max_level': maxlvl[0][i], 'p1_start_level': startlvl[0][i],
    } for i in range(NU)]

    # ---- forces
    ownr = list(sec['OWNR']); side = list(sec['SIDE'])
    fx = sec['FORC']
    fplayer = list(fx[0:8]); fname = struct.unpack('<4H', fx[8:16]); fprop = list(fx[16:20])
    result['owners'] = ownr
    result['sides'] = side
    result['forces'] = [{'index':i,'name':S(fname[i]),'props':fprop[i]} for i in range(4)]
    sprp = sec.get('SPRP', b'')
    result['scenario_name'] = S(struct.unpack('<H', sprp[0:2])[0]) if len(sprp) >= 2 else ''
    result['scenario_desc'] = S(struct.unpack('<H', sprp[2:4])[0]) if len(sprp) >= 4 else ''

    # ---- strings dump
    with open(f'{outdir}/strings.json','w') as f:
        json.dump([{'i': i+1, 'text': clean(s)} for i,s in enumerate(strs_raw) if s.strip()], f, ensure_ascii=False)

    # ---- triggers raw
    trig = sec['TRIG']
    ntrig = len(trig)//2400
    result['trigger_count'] = ntrig
    with open(f'{outdir}/trig.bin','wb') as f:
        f.write(trig)

    result['section_order'] = order
    with open(f'{outdir}/map.json','w') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(json.dumps({'dim':result['dim'],'locations':len(locs),'placed_units':len(units),
                      'custom_units':len(ulist),'strings':len(strs_raw),'triggers':ntrig}, ensure_ascii=False))

main(sys.argv[1], sys.argv[2])
