#import <Foundation/Foundation.h>
#include <string.h>
char *latitudePreferredLanguage(void) {
 @autoreleasepool {
  NSString *language = [[NSLocale preferredLanguages] firstObject];
  return strdup([(language ?: @"en-US") UTF8String]);
 }
}
