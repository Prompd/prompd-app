const fs = require('fs');
const yaml = require('yaml');

const content = fs.readFileSync('C:/git/github/Logikbug/prompds/@prompd/public-examples/workflows/chat-agent.pdflow', 'utf8');
const workflow = yaml.parse(content);

// Find all tool-call-router nodes
const routers = workflow.nodes.filter(n => n.type === 'tool-call-router');
console.log('Tool Call Router nodes:', routers.length);

routers.forEach(router => {
  const children = workflow.nodes.filter(n => n.parentId === router.id);
  console.log(`\nRouter: ${router.data.label || router.id}`);
  console.log(`  ID: ${router.id}`);
  console.log(`  Children: ${children.length}`);
  if (children.length > 0) {
    children.forEach(child => {
      console.log(`    - ${child.data.label || child.id} (${child.type})`);
    });
  }
});
