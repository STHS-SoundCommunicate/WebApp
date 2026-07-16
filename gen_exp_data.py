#実験用データの生成　生成する個数を入力
import random
import json
sample = int(input("生成するデータ数"))
data = []
for i in range(sample):
    temp = ""
    for j in range(50):
        temp += chr(0x41 + random.randint(0,25))
    data.append(temp)

with open("data.json", mode='w', encoding='utf-8') as f:
    json.dump([{"id": i, "string_data": data[i]} for i in range(sample)], f, ensure_ascii=False, indent=2)
