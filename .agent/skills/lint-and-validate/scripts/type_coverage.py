#!/usr/bin/env python3
"""
Type Coverage Checker - Measures TypeScript/Python type coverage.
Identifies untyped functions, any usage, and type safety issues.
"""
import sys
import re
import json
from datetime import datetime, timezone
from pathlib import Path

# Fix Windows console encoding for Unicode output
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass  # Python < 3.7

ANY_PATTERN = re.compile(r':\s*any\b')
BASELINE_FILENAME = "type_coverage_baseline.json"

def collect_any_entries(project_path: Path, ts_files: list[Path]) -> list[dict]:
    entries = []
    for file_path in ts_files:
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            for idx, line in enumerate(content.splitlines(), start=1):
                if ANY_PATTERN.search(line):
                    entries.append({
                        'file': str(file_path.relative_to(project_path)),
                        'line': idx,
                        'signature': line.strip()
                    })
        except Exception:
            continue
    return entries

def load_baseline(project_path: Path) -> list[dict]:
    baseline_path = project_path / BASELINE_FILENAME
    if not baseline_path.exists():
        return []
    try:
        payload = json.loads(baseline_path.read_text(encoding='utf-8'))
        return payload.get('entries', [])
    except Exception:
        return []

def write_baseline(project_path: Path, entries: list[dict]) -> None:
    baseline_path = project_path / BASELINE_FILENAME
    payload = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'entries': entries
    }
    baseline_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding='utf-8')

def check_typescript_coverage(project_path: Path, write_baseline_flag: bool = False) -> dict:
    """Check TypeScript type coverage."""
    issues = []
    passed = []
    stats = {'any_count': 0, 'untyped_functions': 0, 'total_functions': 0}
    
    ts_files = list(project_path.rglob("*.ts")) + list(project_path.rglob("*.tsx"))
    ts_files = [f for f in ts_files if 'node_modules' not in str(f) and '.d.ts' not in str(f)]
    ts_files = sorted(ts_files, key=lambda p: str(p))
    
    if not ts_files:
        return {'type': 'typescript', 'files': 0, 'passed': [], 'issues': ["[!] No TypeScript files found"], 'stats': stats}
    
    for file_path in ts_files:
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Count 'any' usage
            any_matches = ANY_PATTERN.findall(content)
            stats['any_count'] += len(any_matches)
            
            # Find functions without return types
            # function name(params) { - no return type
            untyped = re.findall(r'function\s+\w+\s*\([^)]*\)\s*{', content)
            # Arrow functions without types: const fn = (x) => or (x) =>
            untyped += re.findall(r'=\s*\([^:)]*\)\s*=>', content)
            stats['untyped_functions'] += len(untyped)
            
            # Count typed functions
            typed = re.findall(r'function\s+\w+\s*\([^)]*\)\s*:\s*\w+', content)
            typed += re.findall(r':\s*\([^)]*\)\s*=>\s*\w+', content)
            stats['total_functions'] += len(typed) + len(untyped)
            
        except Exception:
            continue
    
    any_entries = collect_any_entries(project_path, ts_files)
    if write_baseline_flag:
        write_baseline(project_path, any_entries)

    baseline_entries = load_baseline(project_path)
    baseline_set = {f"{e.get('file')}:{e.get('line')}:{e.get('signature')}" for e in baseline_entries}
    current_set = {f"{e.get('file')}:{e.get('line')}:{e.get('signature')}" for e in any_entries}
    new_any = sorted(current_set - baseline_set)

    if baseline_entries:
        if new_any:
            issues.append(f"[X] {len(new_any)} new 'any' types found (baseline regression)")
        else:
            passed.append(f"[OK] No new 'any' types found (baseline {len(baseline_set)})")
    else:
        if stats['any_count'] == 0:
            passed.append("[OK] No 'any' types found")
        elif stats['any_count'] <= 5:
            issues.append(f"[!] {stats['any_count']} 'any' types found (acceptable)")
        else:
            issues.append(f"[X] {stats['any_count']} 'any' types found (too many)")
    
    if stats['total_functions'] > 0:
        typed_ratio = (stats['total_functions'] - stats['untyped_functions']) / stats['total_functions'] * 100
        if typed_ratio >= 80:
            passed.append(f"[OK] Type coverage: {typed_ratio:.0f}%")
        elif typed_ratio >= 50:
            issues.append(f"[!] Type coverage: {typed_ratio:.0f}% (improve)")
        else:
            if baseline_entries:
                issues.append(f"[!] Type coverage: {typed_ratio:.0f}% (baseline mode)")
            else:
                issues.append(f"[X] Type coverage: {typed_ratio:.0f}% (too low)")
    
    passed.append(f"[OK] Analyzed {len(ts_files)} TypeScript files")
    
    return {'type': 'typescript', 'files': len(ts_files), 'passed': passed, 'issues': issues, 'stats': stats}

def check_python_coverage(project_path: Path) -> dict:
    """Check Python type hints coverage."""
    issues = []
    passed = []
    stats = {'untyped_functions': 0, 'typed_functions': 0, 'any_count': 0}
    
    py_files = list(project_path.rglob("*.py"))
    py_files = [f for f in py_files if not any(x in str(f) for x in ['venv', '__pycache__', '.git', 'node_modules'])]
    
    if not py_files:
        return {'type': 'python', 'files': 0, 'passed': [], 'issues': ["[!] No Python files found"], 'stats': stats}
    
    for file_path in py_files[:30]:  # Limit
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Count Any usage
            any_matches = re.findall(r':\s*Any\b', content)
            stats['any_count'] += len(any_matches)
            
            # Find functions with type hints
            typed_funcs = re.findall(r'def\s+\w+\s*\([^)]*:[^)]+\)', content)
            typed_funcs += re.findall(r'def\s+\w+\s*\([^)]*\)\s*->', content)
            stats['typed_functions'] += len(typed_funcs)
            
            # Find functions without type hints
            all_funcs = re.findall(r'def\s+\w+\s*\(', content)
            stats['untyped_functions'] += len(all_funcs) - len(typed_funcs)
            
        except Exception:
            continue
    
    total = stats['typed_functions'] + stats['untyped_functions']
    
    if total > 0:
        typed_ratio = stats['typed_functions'] / total * 100
        if typed_ratio >= 70:
            passed.append(f"[OK] Type hints coverage: {typed_ratio:.0f}%")
        elif typed_ratio >= 40:
            issues.append(f"[!] Type hints coverage: {typed_ratio:.0f}%")
        else:
            issues.append(f"[X] Type hints coverage: {typed_ratio:.0f}% (add type hints)")
    
    if stats['any_count'] == 0:
        passed.append("[OK] No 'Any' types found")
    elif stats['any_count'] <= 3:
        issues.append(f"[!] {stats['any_count']} 'Any' types found")
    else:
        issues.append(f"[X] {stats['any_count']} 'Any' types found")
    
    passed.append(f"[OK] Analyzed {len(py_files)} Python files")
    
    return {'type': 'python', 'files': len(py_files), 'passed': passed, 'issues': issues, 'stats': stats}

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    write_baseline_flag = "--write-baseline" in sys.argv
    project_path = Path(target)
    
    print("\n" + "=" * 60)
    print("  TYPE COVERAGE CHECKER")
    print("=" * 60 + "\n")
    
    results = []
    
    # Check TypeScript
    ts_result = check_typescript_coverage(project_path, write_baseline_flag)
    if ts_result['files'] > 0:
        results.append(ts_result)
    
    # Check Python
    py_result = check_python_coverage(project_path)
    if py_result['files'] > 0:
        results.append(py_result)
    
    if not results:
        print("[!] No TypeScript or Python files found.")
        sys.exit(0)
    
    # Print results
    critical_issues = 0
    for result in results:
        print(f"\n[{result['type'].upper()}]")
        print("-" * 40)
        for item in result['passed']:
            print(f"  {item}")
        for item in result['issues']:
            print(f"  {item}")
            if item.startswith("[X]"):
                critical_issues += 1
    
    print("\n" + "=" * 60)
    if critical_issues == 0:
        print("[OK] TYPE COVERAGE: ACCEPTABLE")
        sys.exit(0)
    else:
        print(f"[X] TYPE COVERAGE: {critical_issues} critical issues")
        sys.exit(1)

if __name__ == "__main__":
    main()
