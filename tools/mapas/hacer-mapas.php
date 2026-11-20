<?php
// Dibuja las siluetas de región de la tarjeta de «Continentes» (js/theme.js, GEO_MAPAS).
// Datos: Natural Earth 1:110m, países (dominio público, naturalearthdata.com).
//   php tools/mapas/hacer-mapas.php ne_110m_admin_0_countries.geojson  > salida.json
$j = json_decode(file_get_contents($argv[1]), true);
$ME = ['TUR','SYR','LBN','ISR','PSE','JOR','IRQ','IRN','KWT','SAU','BHR','QAT','ARE','OMN','YEM','CYP'];
$R = [
 'eu'=>['b'=>[-25,50,34,72],  'hi'=>fn($p)=>$p['CONTINENT']==='Europe'],
 'as'=>['b'=>[60,180,-48,56], 'hi'=>fn($p)=>(in_array($p['CONTINENT'],['Asia','Oceania'])&&!in_array($p['ADM0_A3'],$GLOBALS['ME']))||$p['ADM0_A3']==='RUS'],
 'af'=>['b'=>[-20,53,-36,38], 'hi'=>fn($p)=>$p['CONTINENT']==='Africa'],
 'me'=>['b'=>[25,66,11,43],   'hi'=>fn($p)=>in_array($p['ADM0_A3'],$GLOBALS['ME'])],
 'am'=>['b'=>[-170,-33,-57,72],'hi'=>fn($p)=>in_array($p['CONTINENT'],['North America','South America'])],
 'gl'=>['b'=>[-170,180,-58,80],'hi'=>fn($p)=>true],
];
function simplificar(array $p, float $tol): array {
  $n = count($p); if ($n < 3) return $p;
  [$ax,$ay] = $p[0]; [$bx,$by] = $p[$n-1];
  $dx=$bx-$ax; $dy=$by-$ay; $len=sqrt($dx*$dx+$dy*$dy);
  $max=0; $idx=0;
  for ($i=1;$i<$n-1;$i++) {
    $d = $len>0 ? abs($dy*$p[$i][0]-$dx*$p[$i][1]+$bx*$ay-$by*$ax)/$len : hypot($p[$i][0]-$ax,$p[$i][1]-$ay);
    if ($d>$max) { $max=$d; $idx=$i; }
  }
  if ($max<=$tol) return [$p[0],$p[$n-1]];
  $l = simplificar(array_slice($p,0,$idx+1),$tol); $r = simplificar(array_slice($p,$idx),$tol);
  return array_merge(array_slice($l,0,-1),$r);
}
$MAX = 84;
$TOL = 0.55;   // unidades del lado mayor
$out = [];
foreach ($R as $code=>$r) {
  [$x0,$x1,$y0,$y1] = $r['b'];
  $k = cos(deg2rad(($y0+$y1)/2));
  $w = ($x1-$x0)*$k; $h = ($y1-$y0);
  $s = $MAX / max($w,$h);
  $W = (int)round($w*$s); $H = (int)round($h*$s);
  $d = ['hi'=>'','ctx'=>''];
  foreach ($j['features'] as $f) {
    $p = $f['properties']; if ($p['CONTINENT']==='Antarctica') continue;
    $which = $r['hi']($p) ? 'hi' : 'ctx';
    $g = $f['geometry'];
    $polys = $g['type']==='Polygon' ? [$g['coordinates']] : $g['coordinates'];
    foreach ($polys as $poly) {
      $ring = $poly[0];
      $in = false;
      foreach ($ring as $pt) if ($pt[0]>=$x0 && $pt[0]<=$x1 && $pt[1]>=$y0 && $pt[1]<=$y1) { $in = true; break; }
      if (!$in) continue;
      $px=null;$py=null;$str="";$n=0;$minx=1e9;$maxx=-1e9;$miny=1e9;$maxy=-1e9;
      $pts=[]; foreach ($ring as $pt) { $lon=max($x0,min($x1,$pt[0])); $lat=max($y0,min($y1,$pt[1])); $pts[]=[round(($lon-$x0)*$k*$s,1),round(($y1-$lat)*$s,1)]; }
      foreach (simplificar($pts,$GLOBALS['TOL']) as $q) { $x=(int)round($q[0]); $y=(int)round($q[1]); if ($px===null) { $str.="M$x $y"; } else if ($x!==$px || $y!==$py) { $str.='l'.($x-$px).' '.($y-$py); $n++; } $px=$x;$py=$y;$minx=min($minx,$x);$maxx=max($maxx,$x);$miny=min($miny,$y);$maxy=max($maxy,$y); }
      if ($n>3 && ($maxx-$minx>2 || $maxy-$miny>2)) $d[$which].=$str.'z';
    }
  }
  $out[$code] = ['vb'=>"0 0 $W $H", 'hi'=>$d['hi'], 'ctx'=>$d['ctx']];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE), "\n";
