import numpy as np
import wave

# sec を時間軸に変換する
def frac_t(sec, samplerate):
	return np.arange(int(sec * samplerate)) / samplerate

# サイン波を作る
def sin_wave(A, f, t):
	return A * np.sin(2 * np.pi * f * t)

fs = 44100
sec_per_sign = 0.2 #1データあたりの秒数(s)
a = 1
t = frac_t(sec_per_sign, fs)

data_digital = [0, 0, 0, 1, 1, 1, 0, 0, 0]
data_wav = []

for sign in data_digital:
	if sign == 0:
		f = 2500
	else:
		f = 5000
	data_wav.append(sin_wave(a, f, t))

data_wav = np.array(data_wav)

data_wav = data_wav * np.iinfo(np.int16).max

data_wav = data_wav.astype(np.int16)

output_file = "./wav/test_01.wav" #実行するときに絶対 Python/backend-soundplayer で実行すること
with wave.open(output_file, "w") as wf:
	wf.setnchannels(1)
	wf.setsampwidth(2)
	wf.setframerate(fs)
	wf.writeframes(data_wav)