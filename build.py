import sys,glob
v=sys.argv[1] if len(sys.argv)>1 else None
css=open('src/style.css').read(); body=open('src/body.html').read()
js='\n'.join(open(f).read() for f in sorted(glob.glob('src/*.js')))
html=f'''<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FogliaMI · flora e fauna di Milano a 8 bit</title>
<!-- Icone: favicon, schermata Home di iPhone (apple-touch-icon) e di Android (manifest). Ciliegio della schermata di caricamento, fase verde chiaro -->
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="icons/manifest.webmanifest">
<meta name="description" content="Mappa interattiva di alberi, verde e fauna di Milano, costruita su dati aperti letti in diretta.">
<!-- Dipendenze esterne: Leaflet (mappa) e un font pixel per i titoli. Tutto il resto è in questo file. -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
<style>
{css}</style>
</head>
<body>
{body}
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
{js}
</script>
</body>
</html>
'''
out='index.html' if not v else f'fogliami-{v}.html'
open(out,'w').write(html); print(out, len(html))
