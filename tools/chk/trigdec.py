#!/usr/bin/env python3
"""Decode a CHK TRIG section into human-readable trigger text."""
import struct, sys, json

COND = {0:'NoCondition',1:'CountdownTimer',2:'Command',3:'Bring',4:'Accumulate',5:'Kills',
 6:'CommandTheMost',7:'CommandsTheMostAt',8:'MostKills',9:'HighestScore',10:'MostResources',
 11:'Switch',12:'ElapsedTime',13:'Briefing',14:'Opponents',15:'Deaths',16:'CommandTheLeast',
 17:'CommandTheLeastAt',18:'LeastKills',19:'LowestScore',20:'LeastResources',21:'Score',
 22:'Always',23:'Never'}

ACT = {0:'NoAction',1:'Victory',2:'Defeat',3:'PreserveTrigger',4:'Wait',5:'PauseGame',
 6:'UnpauseGame',7:'Transmission',8:'PlayWAV',9:'DisplayTextMessage',10:'CenterView',
 11:'CreateUnitWithProperties',12:'SetMissionObjectives',13:'SetSwitch',14:'SetCountdownTimer',
 15:'RunAIScript',16:'RunAIScriptAtLocation',17:'LeaderBoardControl',18:'LeaderBoardControlAtLocation',
 19:'LeaderBoardResources',20:'LeaderBoardKills',21:'LeaderBoardPoints',22:'KillUnit',
 23:'KillUnitAtLocation',24:'RemoveUnit',25:'RemoveUnitAtLocation',26:'SetResources',
 27:'SetScore',28:'MinimapPing',29:'TalkingPortrait',30:'MuteUnitSpeech',31:'UnmuteUnitSpeech',
 32:'LeaderboardComputerPlayers',33:'LeaderboardGoalControl',34:'LeaderboardGoalControlAtLocation',
 35:'LeaderboardGoalResources',36:'LeaderboardGoalKills',37:'LeaderboardGoalPoints',
 38:'MoveLocation',39:'MoveUnit',40:'LeaderboardGreed',41:'SetNextScenario',42:'SetDoodadState',
 43:'SetInvincibility',44:'CreateUnit',45:'SetDeaths',46:'Order',47:'Comment',48:'GiveUnitsToPlayer',
 49:'ModifyUnitHitPoints',50:'ModifyUnitEnergy',51:'ModifyUnitShields',52:'ModifyUnitResourceAmount',
 53:'ModifyUnitHangarCount',54:'PauseTimer',55:'UnpauseTimer',56:'Draw',57:'SetAllianceStatus',
 58:'DisableDebugMode',59:'EnableDebugMode'}

CMP = {0:'AtLeast',1:'AtMost',10:'Exactly'}
MODI = {0:'SetTo',1:'Add',2:'Subtract',7:'SetTo',8:'Add',9:'Subtract'}
RES = {0:'ore',1:'gas',2:'ore_and_gas'}
SCORE = {0:'total',1:'units',2:'buildings',3:'units_and_buildings',4:'kills',5:'razings',6:'kills_and_razings',7:'custom'}
ORDER = {0:'Move',1:'Patrol',2:'Attack'}
SWITCHACT = {0:'Set',1:'Clear',2:'Toggle',3:'?',4:'Randomize'}
SWITCHSTATE = {2:'Set',3:'Cleared'}
PLAYER = {0:'P1',1:'P2',2:'P3',3:'P4',4:'P5',5:'P6',6:'P7',7:'P8',8:'P9',9:'P10',10:'P11',11:'P12',
 13:'CurrentPlayer',14:'Foes',15:'Allies',16:'NeutralPlayers',17:'AllPlayers',
 18:'Force1',19:'Force2',20:'Force3',21:'Force4',26:'NonAlliedVictoryPlayers'}

def pl(n):
    return PLAYER.get(n, f'Group{n}')

def main(trig_path, map_json, out):
    tb = open(trig_path,'rb').read()
    m = json.load(open(map_json))
    strings = {s['i']: s['text'] for s in json.load(open(map_json.replace('map.json','strings.json')))}
    unames = {u['unit_id']: u['name'] or f"unit{u['unit_id']}" for u in m['unit_settings']}
    lnames = {l['index']: (l['name'] or f"loc{l['index']}") for l in m['locations']}
    def L(i): return lnames.get(i, f'loc{i}') if i else '-'
    def U(i): return unames.get(i, f'unit#{i}')
    def T(i): return strings.get(i, '')

    n = len(tb)//2400
    out_lines = []
    triggers = []
    for t in range(n):
        base = t*2400
        conds, acts = [], []
        for c in range(16):
            o = base + c*20
            loc, grp, num, uid, cmp_, ctype, rtype, flags = struct.unpack('<IIIHBBBB', tb[o:o+18])
            if ctype == 0: break   # terminator: everything after is EUD payload / editor junk
            conds.append({'type':COND.get(ctype,f'C{ctype}'),'loc':loc,'player':grp,'num':num,
                          'unit':uid,'cmp':cmp_,'rtype':rtype,'flags':flags})
        for a in range(64):
            o = base + 320 + a*32
            loc, sid, wav, tm, p1, p2, utype, atype, arg, flags = struct.unpack('<IIIIIIHBBB', tb[o:o+29])
            if atype == 0: break   # terminator: everything after is EUD payload / editor junk
            acts.append({'type':ACT.get(atype,f'A{atype}'),'loc':loc,'str':sid,'wav':wav,'time':tm,
                         'p1':p1,'p2':p2,'utype':utype,'arg':arg,'flags':flags})
        eflags, = struct.unpack('<I', tb[base+2368:base+2372])
        players = [i for i,v in enumerate(tb[base+2372:base+2399]) if v]
        if not conds and not acts: continue
        triggers.append({'i':t,'players':[pl(p) for p in players],'conds':conds,'acts':acts})

        out_lines.append(f'--- Trigger #{t}  players={[pl(p) for p in players]}')
        out_lines.append('  CONDITIONS:')
        for c in conds:
            ty = c['type']
            if ty == 'Deaths':
                out_lines.append(f"    Deaths({pl(c['player'])}, {U(c['unit'])}, {CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            elif ty == 'Bring':
                out_lines.append(f"    Bring({pl(c['player'])}, {U(c['unit'])}, {L(c['loc'])}, {CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            elif ty == 'Command':
                out_lines.append(f"    Command({pl(c['player'])}, {U(c['unit'])}, {CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            elif ty == 'Accumulate':
                out_lines.append(f"    Accumulate({pl(c['player'])}, {CMP.get(c['cmp'],c['cmp'])}, {c['num']}, {RES.get(c['rtype'],c['rtype'])})")
            elif ty == 'Kills':
                out_lines.append(f"    Kills({pl(c['player'])}, {U(c['unit'])}, {CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            elif ty == 'Switch':
                out_lines.append(f"    Switch({c['num']}, {SWITCHSTATE.get(c['rtype'],c['rtype'])})")
            elif ty == 'ElapsedTime':
                out_lines.append(f"    ElapsedTime({CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            elif ty == 'CountdownTimer':
                out_lines.append(f"    CountdownTimer({CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            elif ty == 'Score':
                out_lines.append(f"    Score({pl(c['player'])}, {SCORE.get(c['rtype'],c['rtype'])}, {CMP.get(c['cmp'],c['cmp'])}, {c['num']})")
            else:
                out_lines.append(f"    {ty}(player={pl(c['player'])} unit={U(c['unit'])} loc={L(c['loc'])} num={c['num']} cmp={c['cmp']} rtype={c['rtype']})")
        out_lines.append('  ACTIONS:')
        for a in acts:
            ty = a['type']
            if ty == 'SetDeaths':
                out_lines.append(f"    SetDeaths({pl(a['p1'])}, {U(a['utype'])}, {MODI.get(a['arg'],a['arg'])}, {a['p2']})")
            elif ty == 'CreateUnit':
                out_lines.append(f"    CreateUnit({pl(a['p1'])}, {U(a['utype'])} x{a['arg']}, at {L(a['loc'])})")
            elif ty == 'CreateUnitWithProperties':
                out_lines.append(f"    CreateUnitWithProps({pl(a['p1'])}, {U(a['utype'])} x{a['arg']}, at {L(a['loc'])}, props#{a['p2']})")
            elif ty == 'KillUnitAtLocation':
                out_lines.append(f"    KillUnitAt({pl(a['p1'])}, {U(a['utype'])} x{a['arg']}, {L(a['loc'])})")
            elif ty == 'KillUnit':
                out_lines.append(f"    KillUnit({pl(a['p1'])}, {U(a['utype'])})")
            elif ty == 'RemoveUnitAtLocation':
                out_lines.append(f"    RemoveUnitAt({pl(a['p1'])}, {U(a['utype'])} x{a['arg']}, {L(a['loc'])})")
            elif ty == 'RemoveUnit':
                out_lines.append(f"    RemoveUnit({pl(a['p1'])}, {U(a['utype'])})")
            elif ty == 'GiveUnitsToPlayer':
                out_lines.append(f"    GiveUnits({pl(a['p1'])} -> {pl(a['p2'])}, {U(a['utype'])} x{a['arg']}, {L(a['loc'])})")
            elif ty == 'MoveUnit':
                out_lines.append(f"    MoveUnit({pl(a['p1'])}, {U(a['utype'])} x{a['arg']}, from {L(a['loc'])} to {L(a['p2'])})")
            elif ty == 'Order':
                out_lines.append(f"    Order({pl(a['p1'])}, {U(a['utype'])}, from {L(a['loc'])} to {L(a['p2'])}, {ORDER.get(a['arg'],a['arg'])})")
            elif ty == 'SetResources':
                out_lines.append(f"    SetResources({pl(a['p1'])}, {MODI.get(a['arg'],a['arg'])}, {a['p2']}, {RES.get(a['utype'],a['utype'])})")
            elif ty == 'SetScore':
                out_lines.append(f"    SetScore({pl(a['p1'])}, {MODI.get(a['arg'],a['arg'])}, {a['p2']}, {SCORE.get(a['utype'],a['utype'])})")
            elif ty == 'DisplayTextMessage':
                out_lines.append(f"    Display(\"{T(a['str'])}\")")
            elif ty == 'SetSwitch':
                out_lines.append(f"    SetSwitch({a['p2']}, {SWITCHACT.get(a['arg'],a['arg'])})")
            elif ty == 'ModifyUnitHitPoints':
                out_lines.append(f"    ModifyHP({pl(a['p1'])}, {U(a['utype'])} x{a['arg']}, {L(a['loc'])}, {a['p2']}%)")
            elif ty == 'SetInvincibility':
                out_lines.append(f"    SetInvincibility({pl(a['p1'])}, {U(a['utype'])}, {L(a['loc'])}, arg={a['arg']})")
            elif ty == 'MoveLocation':
                out_lines.append(f"    MoveLocation({L(a['p2'])} -> centered on {pl(a['p1'])} {U(a['utype'])} in {L(a['loc'])})")
            elif ty == 'PreserveTrigger':
                out_lines.append("    PreserveTrigger()")
            elif ty == 'Comment':
                out_lines.append(f"    Comment(\"{T(a['str'])}\")")
            elif ty == 'Wait':
                out_lines.append(f"    Wait({a['time']}ms)")
            elif ty == 'RunAIScript':
                out_lines.append(f"    RunAIScript({a['wav']})")
            elif ty == 'CenterView':
                out_lines.append(f"    CenterView({pl(a['p1'])}, {L(a['loc'])})")
            elif ty == 'MinimapPing':
                out_lines.append(f"    MinimapPing({L(a['loc'])})")
            elif ty == 'SetAllianceStatus':
                out_lines.append(f"    SetAlliance({pl(a['p1'])}, {a['utype']})")
            else:
                out_lines.append(f"    {ty}(p1={pl(a['p1'])} p2={a['p2']} unit={U(a['utype'])} loc={L(a['loc'])} arg={a['arg']} str=\"{T(a['str'])}\" time={a['time']})")
        out_lines.append('')

    open(out,'w').write('\n'.join(out_lines))
    json.dump(triggers, open(out.replace('.txt','.json'),'w'), ensure_ascii=False)
    print(f'{n} triggers -> {out} ({len(out_lines)} lines)')

main(sys.argv[1], sys.argv[2], sys.argv[3])
