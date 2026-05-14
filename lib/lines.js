export const ALL_LINES = {
  flop: [
    'B','X','XF','F','C','R','XR','XC','BC','BF','BR','XRC','RC','XRF','RF','BRC','XRR',
  ],
  turn: [
    'B-B','X-X','X-B','X-XF','X-F','X-C','XC-X','XC-XC','B-X','XC-XF','C-X','C-C','C-B',
    'X-XC','C-F','BC-X','XR-B','XR-X','B-XF','B-XC','XC-B','BC-C','BC-B','XC-XR','X-R',
    'B-BC','C-R','B-C','B-BF','X-BC','R-B','X-BF','BC-F','X-XR','R-X','XR-XF','B-XR',
    'B-F','XR-XC','BC-XC','B-R','BC-XF','C-BC','C-BF','BC-R','XC-BC','XR-XR','XC-BF',
    'B-BR','BR-B','XR-BC','X-BR','BC-BC','XRC-X','BR-X','BC-XR','R-C','BC-BF',
  ],
  river: [
    'B-B-B','X-X-X','X-X-B','XC-X-X','XC-X-B','B-X-X','B-X-B','X-B-B','XC-XC-X','X-B-X',
    'B-B-X','X-XC-X','B-X-F','X-X-F','X-X-XF','X-X-C','B-X-C','X-C-F','X-C-X','X-C-C',
    'C-X-X','XC-XC-XF','B-XC-X','X-C-B','C-C-C','C-X-B','XC-X-XF','XC-XC-XC','X-X-XC',
    'X-XC-XF','C-C-F','XC-X-XC','C-C-X','C-C-B','C-X-F','X-B-XF','C-X-C','C-B-B','X-X-R',
    'B-X-XF','B-X-R','X-XC-XC','X-X-BF','C-B-X','XR-B-B','X-C-R','XR-X-X','BC-X-X',
    'B-B-XF','XC-XC-B','BC-X-B','XR-B-X','XC-X-BF','X-B-BF','X-BC-X','B-XC-XF','B-X-BF',
    'X-B-XC','B-XC-XC','XR-X-B','C-X-R','B-X-XC','XC-B-B','X-X-BC','XC-B-X','B-B-XC',
    'X-X-XR','BC-C-C','X-XC-B','XR-XC-X','XC-X-XR','BC-XC-X','C-C-R','XC-X-BC','BC-C-F',
    'X-B-BC','B-X-BC','BC-C-X','BC-C-B','B-B-BF','X-R-B','B-B-C','B-B-F','B-BC-X','B-C-X',
    'BC-B-B','B-B-BC','R-B-B','BC-X-F','XR-X-XF','B-C-B','BC-X-C','XC-XR-B','X-R-X',
    'BC-B-X','B-C-F','B-C-C','R-X-X','XC-XC-XR','X-XR-B','XR-B-XF','X-XC-XR','X-B-F',
    'B-XC-B','R-X-F','X-BC-XF','R-B-X','X-B-C','XC-BC-X','X-B-XR','B-X-XR','X-XR-X',
    'XC-XR-X','XC-B-XF','R-X-B','BC-XC-XC','B-B-R','X-BC-B','XR-XC-XF','X-X-BR','X-BC-XC',
    'R-X-C','C-R-B','BC-XC-XF','B-BC-C','XR-B-XC','XR-X-XC','X-C-BF','B-BC-B','B-BC-F',
    'XC-XR-XC','XC-XR-XF',
  ],
};

export const ALL_LINES_FLAT = Object.values(ALL_LINES).flat();
