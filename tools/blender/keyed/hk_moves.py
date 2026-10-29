
import hk_lib as H
CR=dict(dip=0.24, lean=-12, L=(0.02,0.12,-0.14), R=(0.03,0.05,-0.14))
def crouch(c,f,**kw):
    d=dict(CR); d.update(kw); H.key(c,f,**d)
MOVES={}
def move(name, end, check):
    def deco(fn): MOVES[name]=(fn,end,check); return fn
    return deco

@move('hk-haymaker', 34, (10,'RightHand'))
def haymaker(c):
    H.key(c,1)
    H.key(c,5,  hips=-12, spine=-6, lean=3, dip=0.03, fwd=-0.02, head=-8, R=(-0.10,0.10,-0.02), L=(0.02,0.10,0.06))
    H.key(c,8,  hips=10, spine=8, lean=-3, dip=0.05, fwd=0.06, head=10, R=(-0.30,-0.04,0.08), L=(0.03,0.22,0.10), LF=(0,-0.06,0.03))
    H.key(c,9,  hips=17, spine=10, lean=-6, dip=0.05, fwd=0.10, head=18, R=(-0.30,-0.46,0.06), L=(0.02,0.25,0.12), LF=(0,-0.09,0.01))
    H.key(c,10, hips=22, spine=12, lean=-8, dip=0.05, fwd=0.12, head=24, R=(0.06,-0.60,0.02), L=(0.02,0.26,0.13), LF=(0,-0.10,0))
    H.key(c,11, hips=24, spine=13, lean=-9, dip=0.055, fwd=0.125, head=25, R=(0.14,-0.56,0.0), L=(0.02,0.26,0.12), LF=(0,-0.10,0))
    H.key(c,13, hips=25, spine=14, lean=-10, dip=0.06, fwd=0.13, head=26, R=(0.12,-0.52,-0.02), L=(0.02,0.26,0.12), LF=(0,-0.10,0))
    H.key(c,20, hips=10, spine=5, lean=-4, dip=0.04, fwd=0.07, head=10, R=(0.05,-0.22,0.0), L=(0.02,0.14,0.06), LF=(0,-0.06,0))
    H.key(c,34)

@move('hk-jab', 11, (3,'LeftHand'))
def jab(c):
    H.key(c,1)
    H.key(c,2, hips=-2, spine=-2, dip=0.01, L=(0.0,0.03,0.02), R=(0.02,0.02,0.02))
    H.key(c,3, hips=-5, spine=-9, lean=-3, dip=0.02, fwd=0.04, head=-4, L=(-0.05,-0.30,0.17), R=(0.03,0.03,0.03), LF=(0,-0.03,0))
    H.key(c,4, hips=-6, spine=-10, lean=-3, dip=0.02, fwd=0.045, head=-4, L=(-0.05,-0.32,0.16), R=(0.03,0.03,0.03), LF=(0,-0.03,0))
    H.key(c,7, hips=-2, spine=-4, dip=0.01, fwd=0.02, L=(0.0,-0.08,0.06), R=(0.02,0.02,0.02), LF=(0,-0.015,0))
    H.key(c,11)

@move('hk-cross', 20, (6,'RightHand'))
def cross(c):
    H.key(c,1)
    H.key(c,3, hips=-6, spine=-4, lean=2, dip=0.02, R=(-0.03,0.05,0.0), L=(0.0,0.03,0.03))
    H.key(c,6, hips=18, spine=11, lean=-6, dip=0.04, fwd=0.07, head=18, R=(0.15,-0.58,0.0), L=(-0.02,0.30,0.13), LF=(0,-0.05,0))
    H.key(c,8, hips=20, spine=12, lean=-7, dip=0.04, fwd=0.075, head=19, R=(0.17,-0.60,-0.01), L=(-0.02,0.30,0.13), LF=(0,-0.05,0))
    H.key(c,13, hips=8, spine=4, lean=-2, dip=0.02, fwd=0.03, head=8, R=(0.06,-0.18,0.0), L=(0,0.12,0.06), LF=(0,-0.02,0))
    H.key(c,20)

@move('hk-low-jab', 12, (4,'LeftHand'))
def low_jab(c):
    crouch(c,1)
    crouch(c,3, hips=-2, spine=-3, L=(0.02,0.14,-0.12))
    crouch(c,4, hips=-6, spine=-10, fwd=0.04, head=-4, L=(-0.04,-0.28,-0.12), LF=(0,-0.03,0))
    crouch(c,5, hips=-6, spine=-11, fwd=0.045, head=-4, L=(-0.04,-0.30,-0.13), LF=(0,-0.03,0))
    crouch(c,8, hips=-2, spine=-4, fwd=0.02, L=(0.0,0.0,-0.13), LF=(0,-0.015,0))
    crouch(c,12)

@move('hk-low-kick', 23, (7,'LeftFoot'))
def low_kick(c):
    crouch(c,1)
    crouch(c,4, hips=-8, lean=-6, dip=0.27, LF=(0.02,0.04,0.06))
    crouch(c,7, hips=-14, spine=-4, lean=4, dip=0.30, head=-6, LF=(0.04,-0.50,0.02), L=(0.04,0.18,-0.10))
    crouch(c,9, hips=-15, spine=-4, lean=5, dip=0.30, head=-6, LF=(0.04,-0.53,0.02), L=(0.04,0.18,-0.10))
    crouch(c,15, hips=-6, lean=-6, dip=0.27, LF=(0.02,-0.15,0.05))
    crouch(c,23)

@move('hk-uppercut', 34, (8,'RightHand'))
def uppercut(c):
    crouch(c,1)
    crouch(c,5, hips=-10, spine=-5, dip=0.30, lean=-14, R=(0.02,-0.02,-0.30))
    H.key(c,8, hips=20, spine=12, lean=4, dip=0.0, fwd=0.05, head=14, R=(0.14,-0.42,0.18), L=(0.0,0.24,0.10), LF=(0,-0.04,0))
    H.key(c,11, hips=24, spine=14, lean=7, dip=-0.02, fwd=0.05, head=16, R=(0.16,-0.36,0.34), L=(0.0,0.24,0.10), LF=(0,-0.04,0))
    H.key(c,20, hips=8, spine=4, lean=2, dip=0.02, fwd=0.02, head=6, R=(0.06,-0.12,0.10), L=(0,0.10,0.05), LF=(0,-0.02,0))
    H.key(c,34)

@move('hk-step-elbow', 31, (14,'RightHand'))
def step_elbow(c):   # 6M overhead: step in, rear arm rises and hammers down, hit frame 14
    H.key(c,1)
    H.key(c,5,  hips=-6, spine=-4, lean=4, dip=0.02, R=(0.0,0.05,0.12), L=(0.0,0.05,0.03))
    H.key(c,10, hips=10, spine=8, lean=2, dip=-0.01, fwd=0.08, head=8, R=(0.12,-0.20,0.40), L=(0.0,0.18,0.08), LF=(0,-0.12,0.06))
    H.key(c,14, hips=20, spine=12, lean=-16, dip=0.06, fwd=0.16, head=18, R=(0.16,-0.52,-0.10), L=(0.0,0.24,0.06), LF=(0,-0.18,0))
    H.key(c,16, hips=21, spine=13, lean=-18, dip=0.07, fwd=0.17, head=18, R=(0.16,-0.52,-0.20), L=(0.0,0.24,0.06), LF=(0,-0.18,0))
    H.key(c,24, hips=8, spine=5, lean=-6, dip=0.03, fwd=0.08, head=8, R=(0.06,-0.20,-0.04), L=(0,0.10,0.04), LF=(0,-0.09,0))
    H.key(c,31)

@move('hk-teep', 25, (8,'LeftFoot'))
def teep(c):   # 4M front push kick, hit frame 8
    H.key(c,1)
    H.key(c,4,  hips=-4, lean=6, dip=0.02, fwd=-0.02, LF=(0.0,-0.10,0.36), L=(0.0,0.06,0.04), R=(0.0,0.03,0.02))
    H.key(c,8,  hips=-6, lean=14, dip=0.0, fwd=-0.03, head=-4, LF=(0.0,-0.62,0.66), L=(0.02,0.10,0.04), R=(0.02,0.04,0.03))
    H.key(c,10, hips=-6, lean=15, dip=0.0, fwd=-0.03, head=-4, LF=(0.0,-0.66,0.64), L=(0.02,0.10,0.04), R=(0.02,0.04,0.03))
    H.key(c,15, hips=-3, lean=8, dip=0.02, LF=(0.0,-0.18,0.34), L=(0.0,0.06,0.03))
    H.key(c,25)

@move('hk-barge', 42, (18,'LeftArm'))
def barge(c):   # 6H Bus Barge: load, then drive the lead shoulder in, hit frame 18
    H.key(c,1)
    H.key(c,8,  hips=-14, spine=-6, lean=-10, dip=0.10, fwd=-0.04, head=-6, L=(0.06,0.10,-0.06), R=(0.04,0.0,-0.06), LF=(0,0.02,0))
    H.key(c,14, hips=-22, spine=-10, lean=-16, dip=0.10, fwd=0.10, head=-10, L=(0.08,0.06,-0.14), R=(0.06,-0.04,-0.10), LF=(0,-0.14,0.06))
    H.key(c,18, hips=-30, spine=-12, lean=-20, dip=0.09, fwd=0.20, head=-14, L=(0.08,0.02,-0.18), R=(0.06,-0.08,-0.12), LF=(0,-0.24,0), RF=(0,-0.08,0))
    H.key(c,21, hips=-31, spine=-13, lean=-21, dip=0.09, fwd=0.22, head=-14, L=(0.08,0.02,-0.18), R=(0.06,-0.08,-0.12), LF=(0,-0.24,0), RF=(0,-0.10,0))
    H.key(c,30, hips=-10, spine=-4, lean=-8, dip=0.05, fwd=0.10, head=-5, L=(0.04,0.04,-0.06), R=(0.03,-0.02,-0.04), LF=(0,-0.12,0), RF=(0,-0.05,0))
    H.key(c,42)

@move('hk-hop-kick', 34, (12,'LeftFoot'))
def hop_kick(c):   # 66H Conductor Hop: small hop, front leg chops down (overhead), hit frame 12
    H.key(c,1)
    H.key(c,4,  dip=0.08, lean=-4, L=(0,0.04,-0.02))
    H.key(c,8,  hips=-6, lean=10, dip=-0.18, fwd=0.06, LF=(0.0,-0.36,0.95), RF=(0,0.0,0.30), L=(0.02,0.10,0.08), R=(0.02,0.04,0.06))
    H.key(c,12, hips=-8, lean=-6, dip=-0.10, fwd=0.12, head=-4, LF=(0.0,-0.56,0.62), RF=(0,-0.02,0.22), L=(0.02,0.10,0.04))
    H.key(c,15, hips=-8, lean=-8, dip=0.04, fwd=0.14, LF=(0.0,-0.40,0.02), RF=(0,-0.04,0.0), L=(0.02,0.08,0.02))
    H.key(c,22, hips=-3, lean=-3, dip=0.04, fwd=0.08, LF=(0,-0.20,0), RF=(0,-0.04,0))
    H.key(c,34)

@move('hk-slap', 24, (7,'RightHand'))
def slap(c):   # 214A Ticket Slap: rear open-hand slap, flatter and quicker than the haymaker, hit frame 7
    H.key(c,1)
    H.key(c,4,  hips=-10, spine=-6, lean=2, dip=0.02, head=-6, R=(-0.22,0.10,0.04), L=(0.02,0.08,0.05))
    H.key(c,6,  hips=8, spine=6, lean=-3, dip=0.03, fwd=0.05, head=8, R=(-0.26,-0.36,0.02), L=(0.02,0.20,0.10), LF=(0,-0.05,0))
    H.key(c,7,  hips=18, spine=11, lean=-5, dip=0.03, fwd=0.07, head=18, R=(0.08,-0.58,0.0), L=(0.02,0.24,0.12), LF=(0,-0.06,0))
    H.key(c,9,  hips=22, spine=13, lean=-6, dip=0.03, fwd=0.075, head=20, R=(0.28,-0.46,-0.04), L=(0.02,0.24,0.12), LF=(0,-0.06,0))
    H.key(c,16, hips=8, spine=4, lean=-2, dip=0.02, fwd=0.03, head=8, R=(0.06,-0.14,0.0), L=(0.0,0.10,0.05), LF=(0,-0.03,0))
    H.key(c,24)

@move('hk-backhand', 28, (9,'LeftHand'))
def backhand(c):   # 214A-2 Change Collect: lead backhand swinging outward, hit frame 9
    H.key(c,1)
    H.key(c,5,  hips=12, spine=8, lean=-2, dip=0.02, head=8, L=(-0.24,0.02,0.10), R=(0.02,0.02,0.02))
    H.key(c,8,  hips=-4, spine=-6, lean=-4, dip=0.03, fwd=0.05, head=-4, L=(-0.14,-0.24,0.16), LF=(0,-0.05,0))
    H.key(c,9,  hips=-10, spine=-10, lean=-5, dip=0.03, fwd=0.06, head=-8, L=(0.0,-0.30,0.16), LF=(0,-0.06,0))
    H.key(c,11, hips=-14, spine=-12, lean=-5, dip=0.03, fwd=0.065, head=-10, L=(0.20,-0.20,0.12), LF=(0,-0.06,0))
    H.key(c,19, hips=-4, spine=-4, lean=-2, dip=0.02, fwd=0.03, L=(0.06,-0.04,0.04), LF=(0,-0.03,0))
    H.key(c,28)

@move('hk-rear-sweep', 42, (12,'RightFoot'))
def rear_sweep(c):   # 214H-3 Off-load (Sweep): drop low and spin the rear leg along the floor, hit frame 12
    H.key(c,1)
    crouch(c,6, hips=10, spine=4, dip=0.30, lean=-16, RF=(-0.06,0.08,0.02))
    crouch(c,10, hips=40, spine=14, dip=0.36, lean=-18, head=20, RF=(-0.30,-0.40,0.03), L=(0.10,0.0,-0.30), R=(0.06,-0.06,-0.26))
    crouch(c,12, hips=58, spine=18, dip=0.38, lean=-18, head=30, RF=(-0.08,-0.92,0.03), L=(0.10,0.0,-0.30), R=(0.06,-0.06,-0.26))
    crouch(c,16, hips=66, spine=20, dip=0.38, lean=-18, head=34, RF=(0.18,-0.82,0.03), L=(0.10,0.0,-0.30), R=(0.06,-0.06,-0.26))
    crouch(c,28, hips=20, spine=6, dip=0.26, lean=-12, head=10, RF=(0.04,-0.20,0.0))
    H.key(c,42)

@move('hk-barge-short', 42, (12,'LeftArm'))
def barge_short(c):   # 214A-3 Off-load (Barge): the rekka ender, a quicker shoulder, hit frame 12
    H.key(c,1)
    H.key(c,6,  hips=-14, spine=-6, lean=-10, dip=0.08, fwd=-0.02, head=-6, L=(0.06,0.08,-0.06), R=(0.04,0.0,-0.06))
    H.key(c,12, hips=-30, spine=-12, lean=-18, dip=0.08, fwd=0.18, head=-14, L=(0.08,0.02,-0.18), R=(0.06,-0.08,-0.12), LF=(0,-0.22,0), RF=(0,-0.06,0))
    H.key(c,16, hips=-31, spine=-13, lean=-19, dip=0.08, fwd=0.20, head=-14, L=(0.08,0.02,-0.18), R=(0.06,-0.08,-0.12), LF=(0,-0.22,0), RF=(0,-0.08,0))
    H.key(c,28, hips=-10, spine=-4, lean=-6, dip=0.04, fwd=0.08, head=-5, LF=(0,-0.10,0), RF=(0,-0.04,0))
    H.key(c,42)

AIR=dict(lean=-5, LF=(0.0,0.10,0.42), RF=(0.0,-0.02,0.36), L=(0.0,0.06,0.04), R=(0.0,0.03,0.03))
def air(c,f,**kw):
    d=dict(AIR); d.update(kw); H.key(c,f,**d)

@move('hk-rush', 31, (10,'LeftHand'))
def rush(c):   # 236x Park Rush: low dash, lead straight driven by the whole body, hit at frame 10 (played squeezed)
    H.key(c,1)
    H.key(c,4,  hips=-6, spine=-4, lean=-10, dip=0.08, fwd=0.04, head=-4, L=(0.0,0.06,-0.02), R=(0.02,0.02,-0.02), RF=(0,-0.06,0.08))
    H.key(c,8,  hips=-10, spine=-8, lean=-18, dip=0.12, fwd=0.20, head=-8, L=(-0.04,-0.30,0.06), R=(0.03,0.04,0.0), LF=(0,-0.20,0.06), RF=(0,-0.10,0.10))
    H.key(c,10, hips=-12, spine=-12, lean=-20, dip=0.12, fwd=0.30, head=-10, L=(-0.05,-0.52,0.12), R=(0.03,0.06,0.0), LF=(0,-0.30,0), RF=(0,-0.16,0.04))
    H.key(c,13, hips=-12, spine=-12, lean=-20, dip=0.12, fwd=0.32, head=-10, L=(-0.05,-0.54,0.11), R=(0.03,0.06,0.0), LF=(0,-0.30,0), RF=(0,-0.18,0.0))
    H.key(c,22, hips=-4, spine=-4, lean=-6, dip=0.05, fwd=0.14, L=(0.0,-0.10,0.03), LF=(0,-0.14,0), RF=(0,-0.08,0))
    H.key(c,31)

@move('hk-danfo-door', 41, (5,'RightHand'))
def danfo_door(c):   # 623x: crouch, explode up with a rising uppercut and leave the floor, hit from frame 5
    H.key(c,1)
    crouch(c,3, hips=-10, spine=-4, dip=0.28, lean=-14, R=(0.02,0.0,-0.28))
    H.key(c,5,  hips=18, spine=10, lean=4, dip=-0.10, fwd=0.04, head=12, R=(0.12,-0.36,0.28), L=(0.0,0.20,0.10), LF=(0,-0.04,0.12), RF=(0,0.0,0.08))
    H.key(c,9,  hips=26, spine=14, lean=9, dip=-0.36, fwd=0.06, head=16, R=(0.16,-0.24,0.62), L=(0.0,0.22,0.16), LF=(0,-0.04,0.42), RF=(0,0.02,0.34))
    H.key(c,14, hips=26, spine=14, lean=8, dip=-0.40, fwd=0.06, head=14, R=(0.14,-0.20,0.60), L=(0.0,0.22,0.16), LF=(0,-0.04,0.48), RF=(0,0.02,0.40))
    H.key(c,24, hips=14, spine=8, lean=2, dip=-0.12, fwd=0.05, head=8, R=(0.08,-0.12,0.20), L=(0,0.14,0.08), LF=(0,-0.04,0.12), RF=(0,0.02,0.10))
    crouch(c,30, dip=0.20, fwd=0.04, LF=(0,-0.04,0), RF=(0,0.02,0))
    H.key(c,41)

@move('hk-feint', 19, (10,'LeftArm'))
def feint(c):   # 22L Bus Stop (feint): lunge the shoulder in like a rush, then pull back
    H.key(c,1)
    H.key(c,6,  hips=-8, spine=-6, lean=-12, dip=0.08, fwd=0.10, head=-6, L=(-0.02,-0.12,0.0), LF=(0,-0.12,0.04))
    H.key(c,10, hips=-10, spine=-8, lean=-14, dip=0.10, fwd=0.16, head=-8, L=(-0.03,-0.18,0.02), LF=(0,-0.16,0))
    H.key(c,14, hips=4, spine=2, lean=4, dip=0.04, fwd=0.04, head=2, L=(0.0,0.04,0.04), LF=(0,-0.06,0))
    H.key(c,19)

@move('hk-hop-hammer', 31, (14,'RightHand'))
def hop_hammer(c):   # 22M Bus Stop (hop): small hop forward, two-handed hammer down (overhead), hit frame 14
    H.key(c,1)
    H.key(c,5,  dip=0.10, lean=-6, L=(0.0,0.04,-0.04), R=(0.0,0.02,-0.04))
    H.key(c,10, hips=6, spine=4, lean=8, dip=-0.22, fwd=0.10, head=4, L=(0.06,-0.04,0.44), R=(0.16,-0.10,0.40), LF=(0,-0.10,0.30), RF=(0,-0.02,0.30))
    H.key(c,14, hips=10, spine=6, lean=-18, dip=0.02, fwd=0.20, head=8, L=(0.04,-0.40,-0.06), R=(0.14,-0.44,-0.10), LF=(0,-0.20,0.02), RF=(0,-0.10,0.02))
    H.key(c,17, hips=10, spine=6, lean=-20, dip=0.08, fwd=0.21, head=8, L=(0.04,-0.40,-0.16), R=(0.14,-0.44,-0.20), LF=(0,-0.20,0), RF=(0,-0.10,0))
    H.key(c,24, hips=4, spine=2, lean=-8, dip=0.05, fwd=0.12, L=(0.0,-0.10,-0.04), R=(0.04,-0.10,-0.04), LF=(0,-0.12,0), RF=(0,-0.06,0))
    H.key(c,31)

@move('hk-slide', 36, (14,'LeftFoot'))
def slide(c):   # 22H Bus Stop (slide): drop and slide in feet first along the floor, hit frame 14
    H.key(c,1)
    H.key(c,6,  dip=0.14, lean=-6, fwd=0.04, L=(0.0,0.06,-0.06), RF=(0,-0.04,0.0))
    H.key(c,10, hips=-6, lean=22, dip=0.52, fwd=0.20, head=-6, LF=(0.0,-0.50,0.02), RF=(0.0,0.0,0.0), L=(0.06,0.20,-0.30), R=(0.04,0.24,-0.42))
    H.key(c,14, hips=-8, lean=28, dip=0.58, fwd=0.30, head=-8, LF=(0.02,-0.80,0.02), RF=(0.0,-0.10,0.0), L=(0.06,0.24,-0.34), R=(0.04,0.26,-0.48))
    H.key(c,18, hips=-8, lean=28, dip=0.58, fwd=0.32, head=-8, LF=(0.02,-0.82,0.02), RF=(0.0,-0.12,0.0), L=(0.06,0.24,-0.34), R=(0.04,0.26,-0.48))
    H.key(c,28, hips=-4, lean=6, dip=0.20, fwd=0.16, LF=(0,-0.30,0.0), RF=(0,-0.08,0), L=(0.02,0.10,-0.10))
    H.key(c,36)

@move('hk-roundhouse', 39, (13,'RightFoot'))
def roundhouse(c):   # 63214L Danfo Kick: pivot on the lead foot, rear leg whips round at head height, hit frame 13
    H.key(c,1)
    H.key(c,5,  hips=-8, lean=4, dip=0.04, R=(0.0,0.04,0.02), L=(0.0,0.06,0.04))
    H.key(c,9,  hips=30, spine=10, lean=14, dip=0.0, fwd=0.04, head=-10, RF=(-0.36,-0.30,0.62), L=(0.06,0.14,0.06), R=(0.10,0.10,0.0))
    H.key(c,13, hips=62, spine=16, lean=22, side=-14, dip=0.0, fwd=0.06, head=-28, RF=(-0.04,-0.92,1.05), L=(0.06,0.20,0.06), R=(0.14,0.22,-0.08))
    H.key(c,16, hips=72, spine=18, lean=22, side=-14, dip=0.0, fwd=0.06, head=-32, RF=(0.22,-0.80,1.00), L=(0.06,0.20,0.06), R=(0.14,0.22,-0.08))
    H.key(c,24, hips=40, spine=10, lean=10, dip=0.04, fwd=0.04, head=-16, RF=(0.10,-0.20,0.30), L=(0.04,0.10,0.04))
    H.key(c,39)

@move('hk-grab', 34, (6,'RightHand'))
def grab(c):   # throws and the headbutt: both hands shoot out to the shoulders (startup 5-7), then pull back on a whiff
    H.key(c,1)
    H.key(c,3,  hips=-4, lean=-4, dip=0.04, L=(0.0,0.02,0.02), R=(0.02,0.0,0.02))
    H.key(c,6,  hips=8, spine=4, lean=-10, dip=0.06, fwd=0.10, head=4, L=(-0.06,-0.24,0.10), R=(0.20,-0.52,-0.02), LF=(0,-0.10,0))
    H.key(c,8,  hips=8, spine=4, lean=-11, dip=0.06, fwd=0.11, head=4, L=(-0.06,-0.26,0.10), R=(0.20,-0.54,-0.02), LF=(0,-0.10,0))
    H.key(c,20, hips=2, lean=-4, dip=0.03, fwd=0.05, L=(0.0,-0.06,0.04), R=(0.06,-0.14,0.0), LF=(0,-0.05,0))
    H.key(c,34)

@move('hk-heave', 46, (16,'RightHand'))
def heave(c):   # grabbing: hold him for the tech window, then turn and heave him over the hip
    H.key(c,1,  hips=8, spine=4, lean=-11, dip=0.06, fwd=0.11, head=4, L=(-0.06,-0.26,0.10), R=(0.20,-0.54,-0.02), LF=(0,-0.10,0))
    H.key(c,8,  hips=4, spine=2, lean=-6, dip=0.10, fwd=0.08, head=2, L=(-0.04,-0.20,0.06), R=(0.20,-0.44,-0.04), LF=(0,-0.10,0))
    H.key(c,12, hips=-20, spine=-10, lean=-2, dip=0.16, fwd=0.06, head=-10, L=(0.10,-0.10,-0.06), R=(0.10,-0.30,-0.10), LF=(0,-0.10,0))
    H.key(c,16, hips=40, spine=20, lean=-14, dip=0.08, fwd=0.10, head=24, L=(-0.10,-0.20,0.30), R=(0.36,-0.20,0.34), LF=(0,-0.10,0))
    H.key(c,20, hips=55, spine=24, lean=-18, dip=0.06, fwd=0.10, head=30, L=(-0.14,-0.04,0.22), R=(0.40,0.04,0.20), LF=(0,-0.10,0))
    H.key(c,32, hips=20, spine=8, lean=-6, dip=0.04, fwd=0.06, head=10, L=(0.0,0.02,0.04), R=(0.10,-0.06,0.0), LF=(0,-0.06,0))
    H.key(c,46)

@move('hk-held', 20, (4,'Head'))
def held(c):   # grabbed: jolted, hands up to the grabber's arms, up on the toes
    H.key(c,1)
    H.key(c,4,  hips=6, spine=4, lean=10, dip=-0.03, head=-8, L=(-0.04,-0.12,0.14), R=(0.14,-0.30,0.04), RF=(0,0,0.04))
    H.key(c,10, hips=8, spine=4, lean=12, dip=-0.05, head=-10, L=(-0.06,-0.14,0.16), R=(0.16,-0.32,0.06), RF=(0,0,0.06), LF=(0,0,0.03))
    H.key(c,20, hips=8, spine=4, lean=12, dip=-0.05, head=-10, L=(-0.06,-0.14,0.16), R=(0.16,-0.32,0.06), RF=(0,0,0.06), LF=(0,0,0.03))

@move('hk-headbutt', 46, (8,'Head'))
def headbutt(c):   # grabbing after the Conductor's Headbutt: yank him in, rear the head back, smash, shove
    H.key(c,1,  hips=8, spine=4, lean=-11, dip=0.06, fwd=0.11, head=4, L=(-0.06,-0.26,0.10), R=(0.20,-0.54,-0.02), LF=(0,-0.10,0))
    H.key(c,5,  hips=4, spine=2, lean=8, dip=0.04, fwd=0.06, head=0, L=(-0.04,-0.16,0.10), R=(0.18,-0.40,0.0), LF=(0,-0.10,0), extra={'Neck':(0,10,0),'Head':(0,12,0)})
    H.key(c,8,  hips=6, spine=4, lean=-22, dip=0.08, fwd=0.16, head=0, L=(-0.04,-0.20,0.06), R=(0.18,-0.44,-0.04), LF=(0,-0.14,0), extra={'Neck':(0,-12,0),'Head':(0,-14,0)})
    H.key(c,11, hips=6, spine=4, lean=-24, dip=0.08, fwd=0.17, head=0, L=(-0.04,-0.20,0.06), R=(0.18,-0.44,-0.04), LF=(0,-0.14,0), extra={'Neck':(0,-14,0),'Head':(0,-16,0)})
    H.key(c,18, hips=10, spine=6, lean=-8, dip=0.06, fwd=0.14, head=6, L=(-0.10,-0.44,0.04), R=(0.18,-0.60,-0.02), LF=(0,-0.14,0), extra={'Neck':(0,0,0),'Head':(0,0,0)})
    H.key(c,32, hips=2, lean=-2, dip=0.03, fwd=0.06, L=(0.0,-0.06,0.03), R=(0.06,-0.12,0.0), LF=(0,-0.06,0), extra={'Neck':(0,0,0),'Head':(0,0,0)})
    H.key(c,46, extra={'Neck':(0,0,0),'Head':(0,0,0)})

@move('hk-flurry', 56, (8,'LeftHand'))
def flurry(c):   # Fare Collection: eight alternating straights stepping forward, then a closing hook
    H.key(c,1)
    f=5; side=0
    for i in range(8):
        tw = -10 if side==0 else 16
        Lp = (-0.05,-0.32,0.16) if side==0 else (-0.02,0.22,0.12)
        Rp = (0.03,0.03,0.03) if side==0 else (0.15,-0.56,0.0)
        H.key(c,f, hips=tw, spine=tw*0.6, lean=-6, dip=0.05, fwd=0.04+0.02*i, head=tw, L=Lp, R=Rp, LF=(0,-0.04-0.015*i,0), RF=(0,-0.02-0.012*i,0))
        H.key(c,f+1, hips=tw*0.5, spine=tw*0.3, lean=-5, dip=0.05, fwd=0.04+0.02*i, head=tw*0.5, L=(0.0,-0.02,0.06), R=(0.03,-0.08,0.03), LF=(0,-0.04-0.015*i,0), RF=(0,-0.02-0.012*i,0))
        f+=3; side=1-side
    H.key(c,30, hips=-14, spine=-8, lean=-2, dip=0.06, fwd=0.20, head=-8, R=(-0.32,-0.06,0.08), L=(0.02,0.18,0.10), LF=(0,-0.16,0), RF=(0,-0.12,0))
    H.key(c,33, hips=26, spine=14, lean=-10, dip=0.06, fwd=0.24, head=26, R=(0.10,-0.60,0.02), L=(0.02,0.26,0.12), LF=(0,-0.18,0), RF=(0,-0.12,0))
    H.key(c,37, hips=28, spine=15, lean=-11, dip=0.06, fwd=0.25, head=27, R=(0.14,-0.52,-0.02), L=(0.02,0.26,0.12), LF=(0,-0.18,0), RF=(0,-0.12,0))
    H.key(c,46, hips=10, spine=5, lean=-4, dip=0.04, fwd=0.14, R=(0.04,-0.18,0.0), LF=(0,-0.10,0), RF=(0,-0.08,0))
    H.key(c,56)

@move('hk-air-knee', 18, (4,'LeftLeg'))
def air_knee(c):   # j.L: drive the front knee forward and up
    air(c,1)
    air(c,4, hips=40, spine=-14, lean=-14, LF=(0.04,0.16,0.36), RF=(0.0,0.08,0.28), head=18)
    air(c,11, hips=40, spine=-14, lean=-14, LF=(0.04,0.16,0.34), RF=(0.0,0.08,0.28), head=18)
    air(c,18)

@move('hk-air-kick', 18, (5,'LeftFoot'))
def air_kick(c):   # j.M: side kick straight out, leaning away from it
    air(c,1)
    air(c,3, lean=8, LF=(0.0,-0.10,0.55))
    air(c,5, hips=-10, lean=22, head=-10, LF=(0.04,-0.72,0.62), RF=(0.0,0.10,0.40), L=(0.04,0.12,0.0))
    air(c,11, hips=-10, lean=22, head=-10, LF=(0.04,-0.74,0.60), RF=(0.0,0.10,0.40), L=(0.04,0.12,0.0))
    air(c,18)

@move('hk-air-elbow', 20, (8,'RightForeArm'))
def air_elbow(c):   # j.H: tip forward and drive the rear elbow down at the head
    air(c,1)
    air(c,4, hips=-6, lean=6, R=(0.06,0.06,0.24), L=(0.0,0.04,0.10))
    air(c,8, hips=16, spine=8, lean=-30, head=14, R=(0.14,-0.20,-0.06), L=(0.04,0.10,-0.02), LF=(0.0,0.0,0.48), RF=(0.0,0.12,0.50))
    air(c,13, hips=16, spine=8, lean=-30, head=14, R=(0.14,-0.20,-0.08), L=(0.04,0.10,-0.04), LF=(0.0,0.0,0.48), RF=(0.0,0.12,0.50))
    air(c,20)

DOWN=dict(hl=82, sl=2, dip=0.84, LF=(0.04,-0.62,-0.11), RF=(-0.22,-0.95,-0.05), L=(0.30,0.55,-1.22), R=(-0.30,0.30,-1.38))
COVER=dict(L=(-0.03,0.20,0.24), R=(0.09,-0.12,0.08))
import math

@move('hk-idle', 73, (1,'Head'))
def idle(c):   # boxer's bounce, three bobs per loop, first frame = last frame
    for i,f in enumerate(range(1,74,6)):
        ph=(f-1)/72*2*math.pi
        b=0.5-0.5*math.cos(ph*3)            # 0..1, three bounces
        tw=2.5*math.sin(ph)
        H.key(c,f, hips=tw, spine=-tw*0.5, dip=0.028*b, head=-tw, lean=-1.5*b,
              L=(0,0.0,-0.018*b), R=(0,0.0,-0.02*b), LF=(0,0,0), RF=(0,0,0))

def walk(c, speed, back, n=12):
    n=n; travel=speed*n/2       # metres each foot slides while planted (half a cycle)
    for f in range(1,n+2):
        t=((f-1)%n)/n
        def foot(phase):
            u=(t+phase)%1.0
            if u<0.5:   # planted: slides back under the body at walking speed
                y=-travel/2+travel*(u/0.5); z=0.0
            else:       # swings forward, lifted
                v=(u-0.5)/0.5; y=travel/2-travel*v; z=0.07*math.sin(math.pi*v)
            return (0.0, -y if back else y, z)
        bob=0.5-0.5*math.cos(t*4*math.pi)
        H.key(c,f, dip=0.02+0.025*bob, lean=(4 if back else -5), hips=3*math.sin(t*2*math.pi), spine=-1.5*math.sin(t*2*math.pi),
              LF=foot(0.0), RF=foot(0.5), L=(0,0.02,-0.01*bob), R=(0,0.02,-0.012*bob))

@move('hk-walk-fwd', 13, (1,'Head'))
def walk_fwd(c): walk(c, 0.05, False)

@move('hk-walk-back', 13, (1,'Head'))
def walk_back(c): walk(c, 0.038, True)

@move('hk-crouch', 81, (1,'Head'))
def crouch_idle(c):
    for f in range(1,82,10):
        b=0.5-0.5*math.cos((f-1)/80*2*math.pi*2)
        crouch(c,f, dip=0.24+0.012*b, L=(0.02,0.12,-0.14-0.01*b), R=(0.03,0.05,-0.14-0.012*b))

@move('hk-block', 25, (3,'LeftHand'))
def block(c):
    H.key(c,1)
    H.key(c,3, lean=6, dip=0.05, head=-4, **COVER)
    H.key(c,6, lean=10, dip=0.06, fwd=-0.03, head=-6, **COVER)
    H.key(c,14, lean=6, dip=0.05, fwd=-0.02, head=-4, **COVER)
    H.key(c,25, lean=5, dip=0.05, fwd=-0.02, head=-4, **COVER)

@move('hk-crouch-block', 25, (3,'LeftHand'))
def crouch_block(c):
    crouch(c,1)
    crouch(c,3, lean=-6, dip=0.28, L=(-0.03,0.22,0.02), R=(0.09,-0.10,-0.10))
    crouch(c,6, lean=-2, dip=0.29, fwd=-0.03, L=(-0.03,0.22,0.02), R=(0.09,-0.10,-0.10))
    crouch(c,25, lean=-5, dip=0.28, fwd=-0.02, L=(-0.03,0.22,0.02), R=(0.09,-0.10,-0.10))

@move('hk-hit', 27, (3,'Head'))
def hit(c):
    H.key(c,1)
    H.key(c,3, hips=6, lean=14, dip=0.03, fwd=-0.06, head=10, L=(0.06,0.18,0.02), R=(-0.06,0.14,-0.08), extra={'Neck':(0,8,0),'Head':(0,10,0)})
    H.key(c,8, hips=5, lean=11, dip=0.04, fwd=-0.05, head=8, L=(0.04,0.14,0.0), R=(-0.04,0.10,-0.06), extra={'Neck':(0,6,0),'Head':(0,6,0)})
    H.key(c,17, hips=2, lean=4, dip=0.03, fwd=-0.02, head=3, L=(0.01,0.04,0.0), R=(-0.01,0.03,-0.02), extra={'Neck':(0,2,0),'Head':(0,2,0)})
    H.key(c,27, extra={'Neck':(0,0,0),'Head':(0,0,0)})

@move('hk-crouch-hit', 27, (3,'Head'))
def crouch_hit(c):
    crouch(c,1)
    crouch(c,3, hips=6, lean=2, dip=0.27, fwd=-0.05, head=8, L=(0.06,0.20,-0.10), R=(-0.04,0.14,-0.20))
    crouch(c,10, hips=4, lean=-4, dip=0.26, fwd=-0.04, head=6)
    crouch(c,27)

@move('hk-airhit', 41, (6,'Head'))
def airhit(c):
    H.key(c,1, lean=12, fwd=-0.04, head=8, L=(0.06,0.18,0.02), R=(-0.06,0.14,-0.06))
    H.key(c,6, hl=28, sl=9, dip=-0.04, head=10, LF=(0.0,-0.36,0.34), RF=(0.0,-0.30,0.30), L=(0.12,0.45,0.28), R=(-0.12,0.36,0.18), extra={'Neck':(0,10,0),'Head':(0,10,0)})
    H.key(c,20, hl=34, sl=10, dip=-0.04, head=10, LF=(0.0,-0.40,0.40), RF=(0.0,-0.26,0.28), L=(0.14,0.50,0.22), R=(-0.14,0.40,0.12), extra={'Neck':(0,10,0),'Head':(0,10,0)})
    H.key(c,41, hl=30, sl=9, dip=-0.04, head=8, LF=(0.0,-0.38,0.36), RF=(0.0,-0.28,0.30), L=(0.12,0.46,0.24), R=(-0.12,0.38,0.14), extra={'Neck':(0,9,0),'Head':(0,9,0)})

@move('hk-down', 41, (1,'Hips'))
def down(c):   # lying on the back, breathing
    H.key(c,1, **DOWN)
    d=dict(DOWN); d['sl']=3.5; H.key(c,20, **d)
    H.key(c,41, **DOWN)

@move('hk-ko', 91, (1,'Hips'))
def ko(c):   # thrown back by the last hit, lands and stays down
    H.key(c,1, lean=12, fwd=-0.04, head=8)
    H.key(c,8, hl=30, sl=9, dip=-0.04, head=10, LF=(0.0,-0.36,0.34), RF=(0.0,-0.30,0.30), L=(0.12,0.45,0.28), R=(-0.12,0.36,0.18))
    H.key(c,30, **DOWN)
    H.key(c,91, **DOWN)

@move('hk-getup', 14, (13,'Head'))
def getup(c):   # 12 frames: sit up, plant, rise
    H.key(c,1, **DOWN)
    H.key(c,5, hl=24, sl=8, dip=0.58, fwd=0.02, head=-6, LF=(0.02,-0.30,-0.12), RF=(-0.10,-0.40,-0.10), L=(0.26,0.40,-0.95), R=(-0.20,0.12,-1.05))
    crouch(c,9, dip=0.26, lean=-8)
    H.key(c,14)

@move('hk-victory', 151, (40,'LeftHand'))
def victory(c):
    H.key(c,1)
    H.key(c,15, dip=-0.02, lean=6, head=4, L=(0.10,0.34,0.58), R=(-0.08,0.22,0.42), LF=(0,0.04,0), extra={'Neck':(0,6,0),'Head':(0,4,0)})
    H.key(c,32, dip=0.01, lean=4, head=4, L=(0.10,0.34,0.40), R=(-0.08,0.22,0.30), LF=(0,0.04,0), extra={'Neck':(0,4,0),'Head':(0,3,0)})
    H.key(c,44, dip=-0.02, lean=6, head=4, L=(0.10,0.34,0.60), R=(-0.08,0.22,0.44), LF=(0,0.04,0), extra={'Neck':(0,6,0),'Head':(0,4,0)})
    H.key(c,80, hips=8, dip=-0.01, lean=3, head=-6, L=(-0.16,0.36,-0.04), R=(0.22,-0.04,-0.14), LF=(0,0.06,0), extra={'Neck':(0,5,0),'Head':(0,6,0)})
    H.key(c,151, hips=8, dip=-0.01, lean=3, head=-6, L=(-0.16,0.36,-0.04), R=(0.22,-0.04,-0.14), LF=(0,0.06,0), extra={'Neck':(0,5,0),'Head':(0,6,0)})

@move('hk-taunt', 51, (10,'LeftHand'))
def taunt(c):   # lead hand beckons twice: come on
    H.key(c,1)
    for f,y in ((8,-0.24),(15,-0.04),(22,-0.24),(29,-0.04)):
        H.key(c,f, lean=5, dip=0.01, head=6, L=(-0.02,y,0.12), R=(0.02,0.04,0.02), extra={'Neck':(0,4,-6),'Head':(0,3,-6)})
    H.key(c,40, lean=3, head=3, L=(-0.01,-0.04,0.06), extra={'Neck':(0,2,-3),'Head':(0,2,-3)})
    H.key(c,51, extra={'Neck':(0,0,0),'Head':(0,0,0)})

@move('hk-dash', 15, (6,'Hips'))
def dash(c):
    H.key(c,1)
    H.key(c,3, dip=0.05, lean=-8, LF=(0,0.02,0), RF=(0,0.04,0.02))
    H.key(c,6, dip=-0.03, lean=-10, LF=(0,-0.12,0.08), RF=(0,-0.06,0.12), L=(0,0.02,0.02))
    H.key(c,10, dip=0.05, lean=-6, LF=(0,-0.04,0.0), RF=(0,0.06,0.02))
    H.key(c,15)

@move('hk-backdash', 19, (7,'Hips'))
def backdash(c):
    H.key(c,1)
    H.key(c,3, dip=0.05, lean=6, LF=(0,-0.02,0.02), RF=(0,0.0,0))
    H.key(c,7, dip=-0.03, lean=10, LF=(0,0.06,0.12), RF=(0,0.12,0.08), L=(0,0.06,0.04), R=(0,0.04,0.02))
    H.key(c,13, dip=0.05, lean=5, LF=(0,0.0,0.0), RF=(0,0.04,0.0))
    H.key(c,19)

@move('hk-prejump', 5, (5,'Hips'))
def prejump(c):
    H.key(c,1)
    H.key(c,5, dip=0.12, lean=-6, L=(0,0.02,-0.06), R=(0,0.02,-0.06))

@move('hk-jump', 41, (8,'Hips'))
def jump(c):   # 40 frames of airtime: push off, tuck, open up for the landing
    H.key(c,1, dip=-0.03, lean=-4, LF=(0,0.02,0.04), RF=(0,0.04,0.06))
    H.key(c,8, lean=-6, LF=(0.0,0.06,0.40), RF=(0.0,-0.12,0.34), L=(0,0.04,0.04), R=(0,0.02,0.04))
    H.key(c,30, lean=-5, LF=(0.0,0.06,0.38), RF=(0.0,-0.12,0.32), L=(0,0.04,0.04), R=(0,0.02,0.04))
    H.key(c,38, lean=-3, LF=(0.0,0.0,0.08), RF=(0.0,0.0,0.06))
    H.key(c,41)

@move('hk-land', 5, (1,'Hips'))
def land(c):
    H.key(c,1, dip=0.10, lean=-6)
    H.key(c,5)

def run(names=None, export=True):
    out=[]
    for n,(fn,end,(cf,limb)) in MOVES.items():
        if names and n not in names: continue
        c=H.begin(n); fn(c)
        out.append((n, cf, limb, H.reach(c,cf,limb), H.reach(c,cf,'Hips')))
        if export: H.export(c,end)
    return out
