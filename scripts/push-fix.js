const { spawn, execSync } = require('child_process');

function getGitHubToken(accountUsername) {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['credential-manager', 'get'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let output = '';
    p.stdout.on('data', d => output += d);
    p.on('close', code => {
      let pass = '';
      output.split('\n').forEach(l => {
        if (l.startsWith('password=')) pass = l.slice(9).trim();
      });
      resolve(pass);
    });
    p.stdin.write(`protocol=https\nhost=github.com\nusername=${accountUsername}\n\n`);
    p.stdin.end();
  });
}

async function run() {
  const accountUsername = 'Nikitamce';
  execSync('git config user.name "Nikitamce"', { stdio: 'inherit' });
  execSync('git config user.email "187407575+Nikitamce@users.noreply.github.com"', { stdio: 'inherit' });
  execSync('git add -A', { stdio: 'inherit' });
  execSync('git commit -m "fix: resolve game page features by fixing early init return and adding background proxy for cross-origin APIs"', { stdio: 'inherit' });
  
  const token = await getGitHubToken(accountUsername);
  if (!token) throw new Error(`No stored token found for ${accountUsername}`);
  const authedUrl = `https://${encodeURIComponent(accountUsername)}:${encodeURIComponent(token)}@github.com/Nikitamce/Rubacklogged.git`;
  execSync(`git push "${authedUrl}" mixed`, { stdio: 'inherit' });
  console.log('Successfully pushed mixed branch to GitHub!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
