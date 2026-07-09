import ctypes, sys, os, ctypes.util

_LIB = os.environ.get('STORMLIB') or ctypes.util.find_library('storm') or '/opt/homebrew/lib/libstorm.dylib'
S = ctypes.CDLL(_LIB)

S.SFileOpenArchive.argtypes = [ctypes.c_char_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p)]
S.SFileOpenFileEx.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p)]
S.SFileGetFileSize.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
S.SFileReadFile.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.c_void_p]

def extract(scx, out):
    h = ctypes.c_void_p()
    if not S.SFileOpenArchive(scx.encode(), 0, 0x00000100, ctypes.byref(h)):
        raise SystemExit('open archive failed')
    f = ctypes.c_void_p()
    if not S.SFileOpenFileEx(h, b'staredit\\scenario.chk', 0, ctypes.byref(f)):
        raise SystemExit('open chk failed')
    hi = ctypes.c_uint32(0)
    size = S.SFileGetFileSize(f, ctypes.byref(hi))
    buf = ctypes.create_string_buffer(size)
    read = ctypes.c_uint32(0)
    S.SFileReadFile(f, buf, size, ctypes.byref(read), None)
    open(out, 'wb').write(buf.raw[:read.value])
    print('chk bytes:', read.value)

extract(sys.argv[1], sys.argv[2])
