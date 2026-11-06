//go:build darwin && cgo

package locale

/*
#cgo LDFLAGS: -framework Foundation
#include <stdlib.h>
char *latitudePreferredLanguage(void);
*/
import "C"
import "unsafe"

func System() string {
	language := C.latitudePreferredLanguage()
	if language == nil {
		return "en-US"
	}
	defer C.free(unsafe.Pointer(language))
	return C.GoString(language)
}
