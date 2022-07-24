# Flat-Folder: A Crease Pattern Solver

Flat-Folder is some code to compute and analyze valid flat-foldable states of
flat-foldable crease patterns, both assigned and unassigned. 

## How to use

1. Go to [Flat-Folder](https://origamimagiro.github.io/flat-folder/).
    - Tested to run in Chrome, Firefox, and Safari.
    - Chrome usually runs slightly faster than Firefox and much faster than Safari.

2. Upload a crease pattern file in either FOLD, SVG, OPX, or CP file formats.
    - The software will probably have trouble if points in the input file are
      not accurate to single-precision.
    - For SVG format:
        - the import assumes each imported line is an unassigned fold
          (assignment `"U"`), unless its `"style"` attribute contains a
          `"stroke"` whose value is one of `["red", "blue", "gray"]` 
          corresponding to `["M", "V", "F"]` assignments respectively;
        - will also accept values `["#FF0000", "#0000FF", "#808080"]`. 
    - For FOLD format: 
        - Import requires two properties:
            - `vertices_coords`
            - `edges_vertices`
        - Import can also import two optional properties: 
            - `edges_assignment` (if missing, will assume all edges are 
              unassigned `"U"`)
            - `faces_vertices` (if missing, will construct its own set of faces
              from the provided edges)
                - on import, will reorder faces to be increasing by area
    - Once uploaded, Flat-Folder will draw:
        - the crease pattern and
        - an x-ray view of the folded crease pattern.
    - Flat-Folder will draw a red circle behind any vertex of the imported 
      crease pattern that it thinks violates either Maekawa or
      Kawasaki's theorems (the limit for Kawasaki is that the (sum of even
      angles) minus $\pi$ is greater than `0.00001`).

3. Press "Fold" to find flat-foldable states of the crease pattern.
    - Flat-Folder will break up the faceOrder variables into disconnected 
      components of variables whose set of solutions are independently 
      assignable from each other.
    - You can limit the number of solutions to find per component by setting the
      "Limit" option:
        - `all` is defaut. This will attempt to compute all possible folded
          states.
        - Alternatively, you can select a number from [1, 10, 100, 1000], which
          will correspond to the maximum number of solutions to find per
          component.
    - Selecting the "Text" option will draw index labels for all the vertices,
      edges, and faces in the crease pattern.
    - After computing the overlap graph:
        - Flat-Folder will replace the x-ray view with the overlap graph.
        - Clicking on a cell in the overlap graph will highlight:
            - the faces of the crease pattern that overlap the cell (yellow), and
            - the edges of the crease pattern that overlap the segments bounding
              the cell.
        - Clicking on a face of the crease pattern will highlight:
            - the cells of the overlap graph that overlap the face (yellow),
            - the segments of the overlap graph that overlap the edges bounding
              the face, and
            - the other faces of the crease pattern that overlap the selected
              face in the folding (blue). 
                - Each blue face corresponds to a faceOrder variable (the yellow
                  and blue faces overlap, so much be assigned an order).
                - Clicking on one of the blue faces will highlight the
                  features of the corresponding faceOrder variable:
                    - its two faces (yellow),
                    - its taco-taco constraints (green),
                    - its taco-tortilla constraints (red),
                    - its tortilla-tortilla constraints (orange), and
                    - its transitivity constraints (blue).

4. Press "Export" to generate export links to various outputs.
    - Clicking "cp" downloads the crease pattern in FOLD format.
    - Clicking "state" downloads the current folded state in FOLD format.
    - Clicking "img" downloads a snapshot of the current display in SVG format.
    - Clicking "log" downloads a text file of all console output since the most
      recent file was imported.

## Algorithm

Existing software like ORIPA and Orihime/Oriedita find flat-foldable states by:

1. constructing an overlap graph of cells, where each cell is a maximal regions
   of points in the folded image that overlap the same set of crease pattern
   faces, and
2. finding an ordering of faces in each cell that avoids self-intersection of
   the paper.

Flat-Folder takes a different approach for step (2). 
