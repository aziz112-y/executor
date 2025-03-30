dir="${1:-.}"

find "$dir" -type f | while IFS= read -r file; do
    echo "===== $file ====="
    if file "$file" | grep -qi "text"; then
        echo "$file"
    else
        echo "[Binary file; content not displayed]"
    fi
    echo -e "\n"
done