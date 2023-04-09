; ModuleID = 'main.joe'
source_filename = "main.joe"

@0 = private unnamed_addr constant [16 x i8] c"\22Hello, World!\22\00", align 1

declare i32 @printf(i8*, ...)

define void @main() {
entry:
  %0 = call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @0, i32 0, i32 0))
  ret void
}
