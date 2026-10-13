export function demoHTML(html){
  return html.replace('<title>TEMPO · 루틴</title>','<title>TEMPO · 체험</title>')
    .replace(/<link[^>]+rel="manifest"[^>]*>/,'')
    .replace(/<script src="\.\/firebase-config.js"><\/script>/,'')
    .replace(/<script>if\(location.protocol[\s\S]*?<\/script>/,'')
    .replace(/<script>if\('serviceWorker'[\s\S]*?<\/script>/,'')
    .replace('</body>','<script type="module" src="./demo.js?v=3"></script></body>');
}
