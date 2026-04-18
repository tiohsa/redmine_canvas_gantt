const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/GanttToolbar.tsx');
let code = fs.readFileSync(file, 'utf8');

// Replace the main toolbar container
code = code.replace(
    /padding: '10px 20px',\s*backgroundColor: '#ffffff',\s*borderBottom: '1px solid #e0e0e0',\s*height: '60px',/,
    `padding: '16px 24px',
            backgroundColor: 'var(--col-bg13)',
            borderBottom: '1px solid #f2f3f5',
            height: '64px',`
);

// Replace button styles
const buttonRegex = /style={{\s*display: 'flex',\s*alignItems: 'center',\s*justifyContent: 'center',\s*padding: '0',\s*borderRadius: '6px',\s*border: '1px solid #e0e0e0',\s*backgroundColor: ([^,]+),\s*color: ([^,]+),\s*cursor: 'pointer',\s*width: '32px',\s*height: '32px'(?:,\s*position: 'relative')?\s*}}/g;

code = code.replace(buttonRegex, (match, bgExpr, colorExpr) => {
    let condition = null;
    let bgExprTrim = bgExpr.trim();
    if (bgExprTrim.includes('?')) {
        let condStr = bgExprTrim.split('?')[0].trim();
        if (condStr.startsWith('(') && condStr.endsWith(')')) {
            condStr = condStr.substring(1, condStr.length - 1);
        }
        condition = condStr;
    }

    let classExpr = '';
    if (condition) {
        classExpr = `className={\`minimax-pill-nav \${${condition} ? 'active' : ''}\`}`;
    } else {
        classExpr = `className="minimax-pill-nav"`;
    }

    return `${classExpr}\n                    style={{ width: '32px', height: '32px', position: 'relative' }}`;
});

code = code.replace(/background: '#fff',\s*border: '1px solid #e0e0e0',\s*borderRadius: '8px',\s*boxShadow: '0 4px 12px rgba\(0,0,0,0\.08\)',/g, 
    `backgroundColor: 'var(--col-bg13)', /* CSS module classes applied externally where possible, but injected here */
                            border: '1px solid #e5e7eb',
                            borderRadius: '11px',
                            boxShadow: 'var(--shadow-standard)',`
);

fs.writeFileSync(file, code, 'utf8');
console.log("Replaced UI standard classes.");
